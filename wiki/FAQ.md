# FAQ

Preguntas frecuentes sobre GitDB.

## General

### ¿Qué es GitDB?

GitDB es un ORM ligero que transforma repositorios Git en bases de datos relacionales. Combina el control de versiones de Git con operaciones CRUD type-safe.

### ¿Cuándo debo usar GitDB?

✅ **Usa GitDB para:**
- Aplicaciones que necesitan auditoría completa
- Proyectos pequeños/medianos con pocos registros
- Sistemas con sincronización distribuida
- Data que se beneficia del historial de Git

❌ **NO uses GitDB para:**
- Millones de registros
- Aplicaciones con alto volumen transaccional
- Búsquedas complejas frecuentes
- Análisis de datos en tiempo real

### ¿Cuál es el performance?

GitDB funciona en memoria con datos en filesystem/Git. Para:
- < 10,000 registros: ✅ Excelente
- 10,000 - 100,000 registros: ⚠️ Acceptable (depende del hardware)
- > 100,000 registros: ❌ No recomendado

## Installation & Setup

### ¿Cuál es la versión mínima de Node?

Node.js >= 20

### ¿Necesito Git instalado?

Sí. Git debe estar disponible en el PATH del sistema.

```bash
which git  # En macOS/Linux
```

### ¿Puedo usar GitDB en navegador?

No. GitDB está diseñado para Node.js server-side.

## Schema & Entities

### ¿Cómo cambio un schema existente?

GitDB no tiene migrations. Para cambiar schema:

1. Edita la definición de entity en tu código
2. Ejecuta un script que migre los datos manualmente
3. GitDB crea automáticamente un commit con los cambios

```ts
// Viejo schema
const User = entity('users', {
  id: uuid().primary(),
  name: text()
});

// Nuevo schema
const User = entity('users', {
  id: uuid().primary(),
  name: text(),
  email: text().unique()  // Campo nuevo
});

// Migrar datos
const users = await db.select().from(User);
for (const user of users) {
  await db.update(User)
    .set({ email: `${user.name}@example.com` })
    .where(eq('id', user.id));
}
```

### ¿Hay validación de datos?

GitDB valida tipos en TypeScript. Para validación en runtime, usa bibliotecas como Zod:

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email()
});

const validated = UserSchema.parse(data);
await db.insert(User).values(validated);
```

## Queries

### ¿Cómo hago búsquedas type-safe?

Los operadores WHERE son type-safe:

```ts
// ✅ Compilará
await db.select().from(User).where(eq('name', 'John'));

// ❌ Error en compilación - 'nonexistent' no existe
await db.select().from(User).where(eq('nonexistent', 'John'));
```

### ¿Puedo hacer queries complejas?

Sí, combinando operadores:

```ts
const users = await db
  .select()
  .from(User)
  .where(
    or(
      and(gte('age', 18), eq('country', 'US')),
      and(gte('age', 21), eq('country', 'UK'))
    )
  );
```

### ¿Hay paginación?

No integrada. Pero puedes implementarla:

```ts
const page = 2;
const pageSize = 10;

const users = await db.select().from(User);
const paginated = users.slice((page - 1) * pageSize, page * pageSize);
```

## Relations

### ¿Cómo defino relaciones?

```ts
defineRelations(User, {
  posts: {
    type: 'many',
    entity: Post,
    foreignKey: 'userId'
  }
});
```

### ¿Hay cascades?

No. Debes manejar manualmente:

```ts
// Eliminar posts primero
await db.delete().from(Post).where(eq('userId', userId));

// Luego eliminar usuario
await db.delete().from(User).where(eq('id', userId));
```

### ¿Puedo cargar relaciones anidadas?

Sí:

```ts
const user = await db
  .select()
  .from(User)
  .include({
    posts: {
      include: {
        comments: true
      }
    }
  });
```

## Publishing & Releases

### ¿Qué es Changesets?

Changesets es un sistema automático de versionado semántico. Automatiza:
1. Versioning (MAJOR.MINOR.PATCH)
2. Changelog generation
3. Publicación en NPM

### ¿Cómo publico en NPM?

1. Crea un changeset: `npm run changeset`
2. Push a main/develop
3. GitHub Actions crea PR de versión automáticamente
4. Merge el PR → Publicación automática en NPM

### ¿Qué necesito para publicar?

Un `NPM_TOKEN` configurado en GitHub Secrets:

1. npmjs.com → Account → Auth Tokens
2. Crear token con permisos "Publish"
3. GitHub → Settings → Secrets → `NPM_TOKEN`

### ¿Puedo publicar manualmente?

```bash
npm run release
```

Pero es mejor usar changesets para historial limpio.

## Git & Versioning

### ¿Cada operación crea un commit?

Sí. insert/update/delete crean commits automáticos:

```ts
await db.insert(User).values(data);  // Commit automático
await db.update(User).set(updates).where(...);  // Otro commit
```

### ¿Puedo revertir cambios?

Sí, con Git:

```bash
git log --oneline         # Ver commits
git revert <commit-hash>  # Revertir commit específico
git reset --hard HEAD~1   # Deshacer último commit
```

### ¿Puedo usar branches?

Sí. GitDB respeta las branches de Git:

```bash
git checkout -b feature/new-feature
# Editar datos con GitDB
# Hacer commits automáticos
git merge main
```

## Performance

### ¿Cómo optimizo queries?

1. Filtra en la query:
```ts
// ❌ Lento - carga todos
const all = await db.select().from(User);
const filtered = all.filter(u => u.age > 18);

// ✅ Rápido - filtra en lectura
const filtered = await db
  .select()
  .from(User)
  .where(gt('age', 18));
```

2. Usa campos específicos:
```ts
// ❌ Carga todo
const users = await db.select().from(User);

// ✅ Carga solo lo necesario
const users = await db.select(['id', 'name']).from(User);
```

### ¿Cuál es el overhead de Git?

Git es muy eficiente:
- Almacenamiento: ~10% overhead por historial
- Lectura: ~1-5ms por operación en SSD
- Escritura: ~10-50ms por operación en SSD

### ¿Puedo usar caché?

```ts
// Caché simple
const cache = new Map();

async function getUser(id) {
  if (cache.has(id)) return cache.get(id);
  
  const user = await db.select().from(User).where(eq('id', id));
  cache.set(id, user);
  return user;
}
```

## Development

### ¿Hay hot reload?

Sí con `npm run dev`:

```bash
npm run dev  # Watch mode
```

### ¿Cómo debuggeo?

```ts
const db = await gitDb({
  dir: './data',
  author: { name: 'App', email: 'app@example.com' },
  logger: console  // Enable logging
});
```

### ¿Hay type checking?

```bash
npm run typecheck  # Verifica tipos sin compilar
```

## Deployment

### ¿Cómo depliego?

1. Asegúrate que Git está instalado en el servidor
2. Copia el repositorio con datos
3. GitDB continuará funcionando normalmente

```bash
# En producción
git clone <repo-url>
cd <repo>
npm ci
npm start
```

### ¿Debo comprometer los datos a Git?

Sí. Los datos **son** el Git repo. Cada cambio es un commit:

```bash
# Historial completo
git log --stat

# Ver cambios de datos
git show <commit-hash>
```

### ¿Puedo sincronizar entre servidores?

Sí, con git pull/push:

```bash
# En servidor B
git pull origin main
# Datos sincronizados automáticamente
```

## Troubleshooting

### "Git not found"

Git no está en el PATH. Instala Git:

```bash
# macOS
brew install git

# Linux
sudo apt install git

# Windows
choco install git
```

### "Permission denied" errors

Verifica permisos del directorio:

```bash
chmod -R 755 ./data
```

### Tests fallan en CI

Asegúrate que Git está configurado:

```bash
git config --global user.name "CI Bot"
git config --global user.email "ci@example.com"
```

## More Help

- [Getting Started](Getting-Started) - Tutorial rápido
- [API Reference](API-Reference) - Documentación completa
- [Examples](Examples) - Ejemplos prácticos
- Abre un issue en GitHub
