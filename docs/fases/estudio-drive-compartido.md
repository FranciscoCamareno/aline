# Estudio: compartir un entorno en vivo con una carpeta de Drive compartida (plan 12.7)

28 de octubre de 2026 | Sin implementar | Decide el propietario si entra en una versión posterior

## Qué se querría

Que un entorno de trabajo viva en una carpeta de Google Drive compartida con personas concretas, y
que cada una vea y edite lo mismo sin pasarse paquetes: lo que cambia una le llega a las demás al
sincronizar. Hoy (2.0) se comparte con un paquete `.aline` que se envía a mano.

## Lo que ya hay y sirve

- El motor de sincronización (`application/SyncEngine.ts`) ya funciona contra Drive, por objetos
  con su hash, idempotente y sin sobrescribir nunca: lo que dos personas cambien a la vez quedaría
  como conflicto, con la interfaz que ya existe.
- El formato es abierto y por documentos; un entorno sabe qué documentos son suyos.
- El cifrado de extremo a extremo de Drive (tarea 4.9) protege el contenido frente a Google.

## Lo que haría falta

1. **Ver la carpeta de otra persona.** La aplicación pide el ámbito `drive.file`: solo ve lo que ella
   misma crea. Una carpeta compartida por otra persona no aparece hasta que el usuario la elige con
   **Google Picker**, que concede acceso a esa carpeta. Picker es otro script de Google (más orígenes
   en la CSP) y otra pantalla. La alternativa, pedir el ámbito `drive` completo, ve todo el Drive del
   usuario: más permisos, otra revisión de Google para publicar la aplicación y peor para la
   privacidad. Recomendación: Picker.
2. **Un destino de sincronización por entorno.** Hoy hay un solo destino por almacén
   (`binding`); haría falta uno más por cada entorno compartido, que solo sincronice los documentos
   del entorno, con sus marcas y cursores propios (ya van por destino: `drive:<folderId>`).
3. **Documentos de varios almacenes.** Las revisiones llevan el dispositivo que las creó, pero no la
   persona. Habría que decidir qué pasa si alguien añade al entorno un documento nuevo (se descarga
   para todos), si lo quita (se deja de sincronizar, no se borra) y qué se ve de quién hizo cada
   cambio.
4. **Permisos.** Drive decide quién puede leer o escribir la carpeta; la aplicación solo podría
   avisar (por ejemplo, «solo lectura») a partir de los permisos de Drive.
5. **Cifrado compartido.** Con cifrado, todas las personas necesitan la clave del entorno. Habría que
   repartirla por otro medio (como la contraseña de los paquetes) o con un esquema de claves por
   persona. Es lo más delicado.
6. **Pruebas.** Solo hay simulación de Drive (`tests/unit/fakeDrive.ts`); compartir de verdad exige
   probar con varias cuentas reales de Google, que solo puede hacer el propietario.

## Coste aproximado

Grande (varias fases): Picker y CSP (M), destino por entorno en el motor y su interfaz (L), reglas de
miembros entre personas (M), cifrado compartido (L) y pruebas reales con varias cuentas
(propietario). Riesgo: la revisión de Google si cambian los ámbitos o se añade Picker.

## Recomendación

Mantener los paquetes `.aline` como forma de compartir en la 2.0 y, si se usan y se echa de menos la
edición en vivo, empezar por la versión **sin cifrado y con Picker**, con un solo destino compartido
por entorno, como fase propia de una versión posterior.
