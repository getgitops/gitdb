# API Reference

Documentación completa de la API de GitDB.

## Main Exports

```ts
export { GitDB, gitDb } from './core/gitdb.ts';
export { defineRelations } from './core/relations.ts';
export type { /* tipos */ } from './core/relations.ts';
export { /* schema builders */ } from './core/schema.ts';
export { DeleteQuery } from './queries/delete-query.ts';
export { InsertQuery } from './queries/insert-query.ts';
export { and, eq, gte, ilike, lt, ne, not, or } from './queries/where-operators.ts';
export { UpdateQuery } from './queries/update-query.ts';
```

## gitDb()

Inicializa una instancia de GitDB.

### Tipo

```ts
function gitDb(options: GitDbOptions): Promise<GitDB>
```

### Opciones

```ts
interface GitDbOptions {
  dir: string;                    // Directorio del repositorio Git
  author?: {
    name: string;                // Nombre del autor (commits)
    email: string;               // Email del autor
  };
  logger?: GitDbLogger;           // Logger personalizado (opcional)
}
```

### Ejemplo

```ts
const db = await gitDb({
  dir: './data',
  author: {
    name: 'My App',
    email: 'app@example.com'
  }
});
```

## GitDB Class

### Methods

#### `select(fields?)`

Inicia una query SELECT.

```ts
select(): SelectQuery
select(fields: (keyof Entity)[]): SelectQuery
```

**Ejemplo:**
```ts
const allUsers = await db.select().from(User);
const emails = await db.select(['email', 'name']).from(User);
```

#### `insert(entity)`

Inicia una query INSERT.

```ts
insert(entity: EntityDefinition): InsertQuery
```

**Ejemplo:**
```ts
await db.insert(User).values({ id: '1', name: 'John' });
```

#### `update(entity)`

Inicia una query UPDATE.

```ts
update(entity: EntityDefinition): UpdateQuery
```

**Ejemplo:**
```ts
await db.update(User).set({ name: 'Jane' }).where(eq('id', '1'));
```

#### `delete()`

Inicia una query DELETE.

```ts
delete(): DeleteQuery
```

**Ejemplo:**
```ts
await db.delete().from(User).where(eq('id', '1'));
```

#### `$count(entity, where?)`

Cuenta registros.

```ts
$count(entity: EntityDefinition, where?: WhereInput): Promise<number>
```

**Ejemplo:**
```ts
const total = await db.$count(User);
const adults = await db.$count(User, gte('age', 18));
```

#### `$sum(entity, field, where?)`

Suma valores.

```ts
$sum(entity: EntityDefinition, field: string, where?: WhereInput): Promise<number>
```

**Ejemplo:**
```ts
const total = await db.$sum(Product, 'price');
```

#### `$avg(entity, field, where?)`

Calcula promedio.

```ts
$avg(entity: EntityDefinition, field: string, where?: WhereInput): Promise<number | null>
```

**Ejemplo:**
```ts
const avg = await db.$avg(User, 'age');
```

#### `with(relations?, includeRelations?)`

Configura relaciones para cargar.

```ts
with(relationsRegistry: RelationsRegistry, includeRelations?: IncludeRelationsInput): GitDB
with(includeRelations?: IncludeRelationsInput): GitDB
```

**Ejemplo:**
```ts
const result = await db.with({
  posts: true,
  comments: true
}).select().from(User).where(eq('id', 'user-1'));
```

#### `close()`

Cierra la conexión.

```ts
close(): Promise<void>
```

**Ejemplo:**
```ts
await db.close();
```

## Schema Types

### entity()

Define una entidad.

```ts
function entity(name: string, columns: ColumnDefinitions): EntityDefinition
```

### Column Builders

#### Text Types

```ts
text()              // Texto ilimitado
varchar(length?)    // Texto con límite
char(length)        // Texto fijo
```

#### Numeric Types

```ts
int()               // 32-bit integer
integer()           // Alias de int()
bigint()            // 64-bit integer
numeric(p, s)       // Decimal preciso
real()              // Float
double()            // Double
doublePrecision()   // Alias de double()
```

#### Boolean Types

```ts
bool()              // Booleano
boolean()           // Alias de bool()
```

#### Date/Time Types

```ts
date()              // Solo fecha
timestamp()         // Fecha y hora
```

#### Special Types

```ts
uuid()              // UUID
json()              // JSON object
```

#### Modifiers

```ts
.primary()          // Primary key
.unique()           // Unique constraint
```

## Query Methods

### SelectQuery

```ts
from(entity: EntityDefinition): SelectQuery
where(condition: WhereInput): SelectQuery
include(relations: IncludeRelationsInput): SelectQuery
```

**Ejemplo:**
```ts
const result = await db
  .select(['id', 'name'])
  .from(User)
  .where(eq('age', 30))
  .include({ posts: true });
```

### InsertQuery

```ts
values(data: Entity | Entity[]): Promise<Entity | Entity[]>
```

**Ejemplo:**
```ts
const user = await db.insert(User).values({ id: '1', name: 'John' });
```

### UpdateQuery

```ts
set(data: Partial<Entity>): UpdateQuery
where(condition: WhereInput): Promise<void>
```

**Ejemplo:**
```ts
await db.update(User).set({ name: 'Jane' }).where(eq('id', '1'));
```

### DeleteQuery

```ts
from(entity: EntityDefinition): DeleteQuery
where(condition: WhereInput): Promise<void>
```

**Ejemplo:**
```ts
await db.delete().from(User).where(eq('id', '1'));
```

## WHERE Operators

```ts
eq(field, value)        // Equals
ne(field, value)        // Not equals
gt(field, value)        // Greater than
gte(field, value)       // Greater or equal
lt(field, value)        // Less than
lte(field, value)       // Less or equal
ilike(field, pattern)   // Case-insensitive LIKE
and(...predicates)      // Logical AND
or(...predicates)       // Logical OR
not(predicate)          // Logical NOT
```

## Types

### EntityDefinition

```ts
interface EntityDefinition {
  name: string;
  columns: Record<string, ColumnType>;
}
```

### WhereInput

```ts
type WhereInput = Predicate | Predicate[];
```

### IncludeRelationsInput

```ts
type IncludeRelationsInput = Record<string, boolean | IncludeRelationsInput>;
```

## Error Handling

GitDB puede lanzar errores en las siguientes situaciones:

```ts
try {
  await db.insert(User).values(invalid);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.message);
  } else if (error instanceof GitError) {
    console.log('Git error:', error.message);
  } else {
    throw error;
  }
}
```

## Next Steps

- [Getting Started](Getting-Started) - Tutorial
- [Examples](Examples) - Ejemplos prácticos
- [FAQ](FAQ) - Preguntas frecuentes
