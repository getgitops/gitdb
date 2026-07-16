# Getting Started

Tutorial rápido para comenzar con GitDB en 5 minutos.

## 1. Importar y Definir Entities

```ts
import { entity, uuid, text, int, timestamp } from '@kettu/gitdb';

export const User = entity('users', {
  id: uuid().primary(),
  email: text().unique(),
  name: text(),
  age: int(),
  createdAt: timestamp()
});
```

## 2. Inicializar la Base de Datos

```ts
import { gitDb } from '@kettu/gitdb';

const db = await gitDb({
  dir: './data',
  author: {
    name: 'My App',
    email: 'app@example.com'
  }
});
```

## 3. Insertar Datos

```ts
const user = await db.insert(User).values({
  id: 'uuid-1',
  email: 'john@example.com',
  name: 'John Doe',
  age: 30,
  createdAt: new Date()
});
```

## 4. Consultar Datos

```ts
// Obtener todos
const allUsers = await db.select().from(User);

// Con filtros
const adults = await db
  .select()
  .from(User)
  .where(gte('age', 18));

// Campos específicos
const emails = await db
  .select(['email', 'name'])
  .from(User);
```

## 5. Actualizar Datos

```ts
await db
  .update(User)
  .set({ name: 'Jane Doe' })
  .where(eq('id', 'uuid-1'));
```

## 6. Eliminar Datos

```ts
await db
  .delete()
  .from(User)
  .where(eq('id', 'uuid-1'));
```

## 7. Cerrar Conexión

```ts
await db.close();
```

## Ejemplo Completo

```ts
import { gitDb, entity, uuid, text, int, timestamp, eq, gte } from '@kettu/gitdb';

const User = entity('users', {
  id: uuid().primary(),
  email: text().unique(),
  name: text(),
  age: int(),
  createdAt: timestamp()
});

async function main() {
  const db = await gitDb({
    dir: './data',
    author: {
      name: 'My App',
      email: 'app@example.com'
    }
  });

  // Insert
  await db.insert(User).values({
    id: '1',
    email: 'john@example.com',
    name: 'John',
    age: 30,
    createdAt: new Date()
  });

  // Select
  const users = await db.select().from(User);
  console.log(users);

  // Update
  await db.update(User).set({ age: 31 }).where(eq('id', '1'));

  // Delete
  await db.delete().from(User).where(eq('id', '1'));

  await db.close();
}

main().catch(console.error);
```

## Next Steps

- [Schema Documentation](Schema) - Tipos disponibles
- [Query API](Queries) - Operaciones avanzadas
- [Operators](Operators) - Filtros WHERE
