# Enseñanzas del proyecto torrent web app

Stack: FastAPI + python-libtorrent (backend) · React + Vite + Tailwind Catppuccin (frontend)

---

## 1. python-libtorrent en Windows requiere DLLs de OpenSSL 1.1.x

libtorrent para Python en Windows depende de `libcrypto-1_1-x64.dll` y `libssl-1_1-x64.dll`.
Sin ellas, `import libtorrent` falla con un error de importación críptico.

**Fix:** instalar OpenSSL 1.1.1w y copiar las DLLs al directorio del paquete libtorrent,
o instalarlas en algún directorio que esté en el PATH del sistema.

---

## 2. libtorrent pausa los torrents por defecto al añadirlos

`add_torrent_params` tiene por defecto `flags = paused | auto_managed`.
Esto significa que todo torrent se añade en estado pausado y la sesión decide cuándo arrancarlo.

**Fix incorrecto:** llamar `handle.unset_flags(paused | auto_managed)` + `handle.resume()` *después* de `session.add_torrent()` — no funciona de forma fiable porque la sesión ya procesó el estado inicial.

**Fix correcto:** limpiar los flags *antes* de añadir:
```python
params.flags &= ~(lt.torrent_flags.paused | lt.torrent_flags.auto_managed)
handle = session.add_torrent(params)
handle.resume()  # belt-and-suspenders
```

---

## 3. Las rutas relativas con `..` fallan en libtorrent en Windows

Si `save_path` es `"../downloads"`, libtorrent lo pasa literalmente a las APIs de Windows,
que devuelven `ERROR_INVALID_NAME (123)` al intentar crear el archivo.
El torrent recibe un `file_error_alert` → `torrent_error_alert` y se auto-pausa.

**Fix:** resolver siempre la ruta a absoluta antes de pasarla a libtorrent:
```python
self.download_dir = os.path.abspath(download_dir)
```

---

## 4. Los alertas de libtorrent son la fuente de verdad para diagnosticar problemas

Cuando un torrent no descarga, el motivo real está en los alertas:
```python
ses.pop_alerts()  # lista de objetos de alerta
```
Buscar `file_error_alert`, `torrent_error_alert`, `torrent_paused_alert`.
En este proyecto el `torrent_paused_alert` llegaba porque libtorrent no podía abrir el archivo (punto 3).

---

## 5. `torrent_status.paused` puede ser `True` aunque el torrent esté descargando

En libtorrent 2.x, `s.paused` refleja el flag interno, no si los bytes están fluyendo.
Un torrent puede tener `paused=True` y `download_rate > 0` a la vez.
Usar `s.state` y `s.download_rate` juntos para determinar el estado real.

---

## 6. `active_downloads: -1` en la sesión desactiva los límites de cola

Por defecto libtorrent limita cuántos torrents pueden estar activos simultáneamente.
Si el límite está alcanzado, los nuevos torrents quedan en cola (aparecen como pausados).

**Fix:**
```python
settings = {
    "active_downloads": -1,
    "active_seeds": -1,
    "active_limit": -1,
}
```

---

## 7. `time.sleep()` dentro de `async def` bloquea todo el event loop de asyncio

Si un handler de FastAPI llama a una función síncrona con `time.sleep()`, el event loop
queda bloqueado: el progreso loop se detiene, los heartbeats de Socket.io fallan,
el cliente se desconecta.

**Fix:** usar `run_in_executor` para operaciones bloqueantes:
```python
loop = asyncio.get_event_loop()
await loop.run_in_executor(None, blocking_function, arg1, arg2)
```

---

## 8. Persistencia de torrents `.torrent` para reinicio del servidor

Los torrents añadidos por archivo (no magnet) no tienen URI que guardar en DB.
Si el servidor se reinicia, no hay forma de recargarlos salvo guardar el binario.

**Fix:** guardar los bytes del `.torrent` en `{download_dir}/.torrents/{hash}.torrent`
y en el arranque recargar con `load_torrent_file(hash)`.

---

## 9. El estado en DB se vuelve obsoleto si pause/resume no lo persiste

Si las rutas de pausa/reanudación solo actualizan el engine pero no la DB,
al reiniciar el servidor el startup lee el estado antiguo y re-aplica la pausa.

**Fix:** actualizar la DB en cada cambio de estado:
```python
record.status = "paused"
db.delete(hash_str)
db.insert(record)
```

---

## 10. Socket.io v4 (JS) ↔ python-socketio 5.x: configuración ASGI

Para combinar FastAPI con Socket.io en un solo proceso ASGI:
```python
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
fastapi_app = FastAPI()
app = socketio.ASGIApp(sio, fastapi_app)  # app es el punto de entrada ASGI
```
El proxy de Vite debe reenviar tanto `/api` como `/socket.io` con `ws: true`.

---

## 11. `window.confirm()` no es personalizable; usar un modal React propio

El diálogo nativo del navegador no permite estilos, opciones extra (como un checkbox),
ni integrarse con el diseño de la app.

Patrón recomendado: estado local `deleting: TorrentRow | null` + componente modal
que recibe `onConfirm(deleteFiles: boolean)` y `onCancel()`.

---

## 12. FastAPI devuelve 422 (no 400) cuando falla la validación de Pydantic

Los tests que esperan `400` para cuerpos mal formados deben esperar `422 Unprocessable Entity`.
Es el comportamiento estándar de FastAPI/Pydantic.

---

## 13. Duplicados en la DB: usar upsert en lugar de insert + chequeo previo

Si el servidor se reinicia y el cliente reintenta añadir un torrent ya en DB,
un simple `insert` lanza excepción. Mejor hacer upsert:
```python
db.delete(hash_str)  # no-op si no existe
db.insert(record)
```

---

## 14. El hash de libtorrent puede ser v1 o v2 (híbrido)

En libtorrent 2.x, `handle.info_hash()` devuelve un objeto que puede tener `.v1` y `.v2`.
Para obtener una clave de string consistente:
```python
ih = handle.info_hash()
hash_str = str(ih.v1) if hasattr(ih, "v1") else str(ih)
```

---

## 15. Los archivos `__pycache__` deben excluirse del repositorio

Añadir al `.gitignore` antes del primer commit de código Python:
```
__pycache__/
*.pyc
*.pyo
```
Si ya se commitearon, limpiarlos con `git rm -r --cached **/__pycache__`.
