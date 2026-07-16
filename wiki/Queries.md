# Query API

Guía completa sobre operaciones CRUD y queries.

## Insert

Insertar nuevos registros en la base de datos.

### Sintaxis Básica

```ts
await db.insert(Entity).values(data);
```

### Ejemplo Simple

```ts
const user = await db.insert(User).values({
  id: 'uuid-1',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  createdAt: new Date()
});
```

### Insertar Múltiples Registros

```ts
const users = await db.insert(User).values([
  {
    id: 'uuid-1',
    email: 'john@example.com',
    name: 'John',
    age: 30,
    createdAt: new Date()
  },
  {
    id: 'uuid-2',
    email: 'jane@example.com',
    name: 'Jane',
    age: 28,
    createdAt: new Date()
  }
]);
```

## Select

Consultar registros con filtros opcionales.

### Obtener Todos

```ts
const allUsers = await db.select().from(User);
```

### Seleccionar Campos Específicos

```ts
const emails = await db
  .select(['email', 'name'])
  .from(User);
```

### Con WHERE Clause

```ts
const adults = await db
  .select()
  .from(User)
  .where(eq('age', 30));
```

### Con múltiples condiciones

```ts
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

### Con Relaciones (Include)

```ts
const userWithPosts = await db
  .select()
  .from(User)
  .where(eq('id', 'uuid-1'))
  .include({
    posts: true  // Cargar relación 'posts'
  });
```

### Selecting with Custom Conditions

```ts
const query = db.select(['id', 'name', 'email']).from(User);

// Aplicar condiciones dinámicamente
if (filterAge) {
  query.where(gte('age', 18));
}

const results = await query;
```

## Update

Actualizar registros existentes.

### Sintaxis Básica

```ts
await db
  .update(Entity)
  .set(updatedFields)
  .where(condition);
```

### Ejemplo

```ts
await db
  .update(User)
  .set({
    name: 'Jane Doe',
    age: 31,
    updatedAt: new Date()
  })
  .where(eq('id', 'uuid-1'));
```

### Actualizar múltiples registros

```ts
await db
  .update(User)
  .set({ isActive: false })
  .where(lt('age', 18)); // Desactivar menores de edad
```

## Delete

Eliminar registros.

### Sintaxis Básica

```ts
await db
  .delete()
  .from(Entity)
  .where(condition);
```

### Ejemplo

```ts
await db
  .delete()
  .from(User)
  .where(eq('id', 'uuid-1'));
```

### Eliminar múltiples registros

```ts
await db
  .delete()
  .from(User)
  .where(gte('createdAt', oneYearAgo)); // Archivar antiguos
```

## Raw Queries

Para consultas más complejas, usa el método `$raw`:

```ts
const results = await db.$raw<MyType>(
  'SELECT * FROM users WHERE age > ?',
  [18]
);
```

## Transaction-like Behavior

GitDB ejecuta cada operación como un commit Git automático:

```ts
// Cada operación crea un commit
await db.insert(User).values(userData);  // Commit 1
await db.update(User).set(updates).where(...);  // Commit 2
await db.delete().from(User).where(...);  // Commit 3

// Todos los cambios quedan en el historio de Git
```

## Closure

Cierra la conexión cuando termines:

```ts
await db.close();
```

## Next Steps

- [WHERE Operators](Operators) - Filtros avanzados
- [Aggregations](Aggregations) - COUNT, SUM, AVG
- [Relations](Relations) - Trabajar con relaciones
