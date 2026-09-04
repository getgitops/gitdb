# @getgitops/gitdb

Un ORM ligero y type-safe construido sobre Git como almacenamiento. Perfect para aplicaciones que necesitan versionado, auditoría y sincronización distribuida de datos.

**GitDB** transforma repositorios Git en bases de datos relacionales, permitiendo CRUD operations con control de versiones automático, relaciones tipadas y queries type-safe.

## Características

- 🔐 **Type-Safe**: TypeScript first, validación de tipos en tiempo de compilación
- 📦 **Git-Powered**: Cada cambio es un commit automático con historial completo
- 🔗 **Relaciones Tipadas**: Soporte para relaciones One-to-Many y Many-to-One
- 🎯 **Queries Type-Safe**: Operadores WHERE validados por tipos
- 📊 **Agregaciones**: Soporte para COUNT, SUM, AVG
- 🚀 **Ligero**: Sin dependencias externas, basado en Git nativo

## Instalación

```bash
npm install @getgitops/gitdb
```

**Requisitos:**
- Node.js >= 20
- Git 2.20+

## Uso Rápido

### 1. Definir Schema

```ts
import { entity, uuid, text, int, timestamp } from '@getgitops/gitdb';

export const User = entity('users', {
  id: uuid().primary(),
  email: text().unique(),
  name: text(),
  age: int(),
  createdAt: timestamp()
});

export const Post = entity('posts', {
  id: uuid().primary(),
  userId: uuid(),
  title: text(),
  content: text(),
  createdAt: timestamp()
});
```

### 2. Inicializar GitDB

```ts
import { gitDb } from '@getgitops/gitdb';

const db = gitDb('https://github.com/org/repo.git', {
  gitUserName: 'App Bot',
  gitUserEmail: 'bot@example.com',
});

await db.ready();
```

#### Autenticación con Personal Access Token

Si el repositorio remoto es privado, pasa un token de acceso personal de GitHub vía `authToken` (recomendado tomarlo de una variable de entorno) o simplemente define `GITDB_GITHUB_TOKEN`/`GITHUB_TOKEN` en el entorno y `gitDb` lo detecta automáticamente:

```ts
const db = gitDb('https://github.com/org/repo.git', {
  authToken: process.env.GITHUB_TOKEN,
});
```

El token nunca se define en `repositoryUrl`; `gitdb` lo agrega automáticamente como credenciales en la URL del remoto (`origin`) al clonar/sincronizar el repo local.

### 3. Operaciones CRUD

#### Insert

```ts
const newUser = await db.insert(User).values({
  id: 'uuid-1',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  createdAt: new Date()
});
```

#### Select

```ts
// Obtener todos
const allUsers = await db.select().from(User);

// Con WHERE
const adults = await db
  .select()
  .from(User)
  .where(gte('age', 18));

// Campos específicos
const emails = await db
  .select(['email', 'name'])
  .from(User);

// Con AND/OR
const filtered = await db
  .select()
  .from(User)
  .where(
    and(
      eq('age', 30),
      ilike('email', '%@example.com')
    )
  );
```

#### Update

```ts
await db
  .update(User)
  .set({ name: 'Jane Doe', age: 31 })
  .where(eq('id', 'uuid-1'));
```

#### Delete

```ts
await db
  .delete()
  .from(User)
  .where(eq('id', 'uuid-1'));
```

### 4. Relaciones

```ts
import { defineRelations } from '@getgitops/gitdb';

defineRelations(User, {
  posts: {
    type: 'many',
    entity: Post,
    foreignKey: 'userId'
  }
});

defineRelations(Post, {
  author: {
    type: 'one',
    entity: User,
    foreignKey: 'userId'
  }
});

// Usar con include
const userWithPosts = await db
  .select()
  .from(User)
  .where(eq('id', 'uuid-1'))
  .include({
    posts: true
  });
```

### 5. Agregaciones

```ts
// COUNT
const totalUsers = await db.$count(User);
const adults = await db.$count(User, gte('age', 18));

// SUM
const totalAge = await db.$sum(User, 'age');

// AVG
const avgAge = await db.$avg(User, 'age');
```

## Tipos Soportados

- `uuid()` - UUID/GUID
- `text()` - Texto
- `varchar(n)` - Texto con límite
- `int()` / `integer()` - Enteros
- `bigint()` - Enteros grandes
- `real()` / `double()` / `doublePrecision()` - Decimales
- `numeric(precision, scale)` - Decimales precisos
- `bool()` / `boolean()` - Booleanos
- `date()` - Solo fecha
- `timestamp()` - Fecha y hora
- `char(n)` - Carácter fijo
- `json()` - Objeto JSON

## Operadores WHERE

- `eq(field, value)` - Igual
- `ne(field, value)` - No igual
- `gt(field, value)` - Mayor que
- `gte(field, value)` - Mayor o igual
- `lt(field, value)` - Menor que
- `lte(field, value)` - Menor o igual
- `ilike(field, pattern)` - Case-insensitive LIKE
- `and(...predicates)` - AND lógico
- `or(...predicates)` - OR lógico
- `not(predicate)` - Negación

## Desarrollo

### Scripts

```bash
npm run build         # Build distribución
npm run typecheck    # Verificar tipos TypeScript
npm run test         # Ejecutar tests
npm run test:watch   # Tests en modo watch
npm run dev          # Build en watch mode
npm run demo         # Demo interactivo
```

## Publicación y Release

Los releases son manuales, con tags de Git. No se usa changesets.

1. Asegúrate de estar en `main` con los cambios ya mergeados y el árbol limpio.
2. Sube la versión en `package.json` y crea el tag `vX.Y.Z` en un solo paso:
   ```bash
   npm version patch   # o: npm version minor / npm version major
   ```
3. Sube el commit de versión y el tag:
   ```bash
   git push && git push --tags
   ```
4. El push del tag `vX.Y.Z` dispara el workflow `.github/workflows/release.yml`, que compila, testea y publica el paquete en NPM.

### Publicación manual (sin Actions)

Requiere sesión activa con `npm login` y permisos de publish en el paquete:

```bash
npm run release
```

Esto ejecuta clean, build, typecheck, test y `npm publish`.

### Secretos Requeridos

Configura en GitHub (Settings → Secrets):
- `NPM_TOKEN` - Token de acceso a NPM (con permiso de publish)

## GitHub Actions

### release.yml
- Job `test`: corre typecheck y tests en cada push/PR a `main`/`develop`, con Node 20 y 22.
- Job `publish`: solo corre cuando se pushea un tag `vX.Y.Z` (por ejemplo tras `npm version patch && git push --tags`); compila, testea y publica en NPM usando `NPM_TOKEN`.

## Estructura de Proyectos

```
.
├── src/
│   ├── core/
│   │   ├── gitdb.ts          # Clase principal GitDB
│   │   ├── schema.ts         # Builder de schema y tipos
│   │   └── relations.ts      # Definición de relaciones
│   ├── infrastructure/
│   │   ├── git-repository.ts # Abstracciones Git
│   │   ├── file-manager.ts   # Operaciones con filesystem
│   │   └── logger.ts         # Logging
│   ├── queries/
│   │   ├── select-query.ts
│   │   ├── insert-query.ts
│   │   ├── update-query.ts
│   │   ├── delete-query.ts
│   │   └── where-operators.ts
│   ├── types.ts              # Tipos globales
│   └── index.ts              # Exports públicos
├── tests/                    # E2E tests
```

## Licencia

MIT
