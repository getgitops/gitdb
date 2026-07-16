# Examples

Ejemplos prácticos de uso de GitDB.

## Todo App

Aplicación simple de tareas.

```ts
import { gitDb, entity, uuid, text, bool, timestamp, eq } from '@kettu/gitdb';

// Schema
const Todo = entity('todos', {
  id: uuid().primary(),
  title: text(),
  description: text(),
  completed: bool(),
  createdAt: timestamp(),
  updatedAt: timestamp()
});

async function main() {
  const db = await gitDb({
    dir: './data',
    author: { name: 'Todo App', email: 'app@example.com' }
  });

  // Crear tarea
  await db.insert(Todo).values({
    id: '1',
    title: 'Learn GitDB',
    description: 'Complete tutorial',
    completed: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Listar tareas pendientes
  const pending = await db
    .select(['id', 'title'])
    .from(Todo)
    .where(eq('completed', false));

  console.log('Pending todos:', pending);

  // Marcar como completada
  await db
    .update(Todo)
    .set({ completed: true, updatedAt: new Date() })
    .where(eq('id', '1'));

  // Contar completadas
  const done = await db.$count(Todo, eq('completed', true));
  console.log('Done:', done);

  await db.close();
}

main().catch(console.error);
```

## Blog System

Sistema de blog con usuarios, posts y comentarios.

```ts
import {
  gitDb,
  entity,
  uuid,
  text,
  timestamp,
  defineRelations,
  eq,
  and,
  gte
} from '@kettu/gitdb';

// Entidades
const User = entity('users', {
  id: uuid().primary(),
  username: text().unique(),
  email: text().unique(),
  bio: text(),
  createdAt: timestamp()
});

const Post = entity('posts', {
  id: uuid().primary(),
  userId: uuid(),
  title: text(),
  content: text(),
  published: bool(),
  createdAt: timestamp(),
  updatedAt: timestamp()
});

const Comment = entity('comments', {
  id: uuid().primary(),
  postId: uuid(),
  userId: uuid(),
  text: text(),
  createdAt: timestamp()
});

// Relaciones
defineRelations(User, {
  posts: { type: 'many', entity: Post, foreignKey: 'userId' },
  comments: { type: 'many', entity: Comment, foreignKey: 'userId' }
});

defineRelations(Post, {
  author: { type: 'one', entity: User, foreignKey: 'userId' },
  comments: { type: 'many', entity: Comment, foreignKey: 'postId' }
});

defineRelations(Comment, {
  author: { type: 'one', entity: User, foreignKey: 'userId' },
  post: { type: 'one', entity: Post, foreignKey: 'postId' }
});

async function main() {
  const db = await gitDb({
    dir: './blog-data',
    author: { name: 'Blog', email: 'blog@example.com' }
  });

  // Crear usuario
  const userId = 'user-1';
  await db.insert(User).values({
    id: userId,
    username: 'johndoe',
    email: 'john@example.com',
    bio: 'Software Developer',
    createdAt: new Date()
  });

  // Crear post
  const postId = 'post-1';
  await db.insert(Post).values({
    id: postId,
    userId,
    title: 'Introduction to GitDB',
    content: 'GitDB is a unique ORM...',
    published: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Agregar comentario
  await db.insert(Comment).values({
    id: 'comment-1',
    postId,
    userId,
    text: 'Great article!',
    createdAt: new Date()
  });

  // Obtener post con comentarios
  const post = await db
    .select()
    .from(Post)
    .where(eq('id', postId))
    .include({
      author: true,
      comments: {
        include: {
          author: true
        }
      }
    });

  console.log(`Post: ${post.title}`);
  console.log(`Author: ${post.author.username}`);
  console.log(`Comments:`, post.comments);

  // Estadísticas
  const totalPosts = await db.$count(Post);
  const userPosts = await db.$count(Post, eq('userId', userId));
  const comments = await db.$count(Comment, eq('postId', postId));

  console.log(`Total posts: ${totalPosts}`);
  console.log(`User posts: ${userPosts}`);
  console.log(`Comments: ${comments}`);

  await db.close();
}

main().catch(console.error);
```

## Inventory Management

Sistema de gestión de inventario.

```ts
import { gitDb, entity, uuid, text, int, numeric, timestamp, gte, lt, and } from '@kettu/gitdb';

const Product = entity('products', {
  id: uuid().primary(),
  sku: text().unique(),
  name: text(),
  price: numeric(10, 2),
  stock: int(),
  reorderLevel: int(),
  lastRestockAt: timestamp(),
  createdAt: timestamp()
});

async function main() {
  const db = await gitDb({
    dir: './inventory',
    author: { name: 'Inventory', email: 'inventory@example.com' }
  });

  // Agregar productos
  const products = [
    { id: '1', sku: 'PROD-001', name: 'Laptop', price: 999.99, stock: 10, reorderLevel: 5 },
    { id: '2', sku: 'PROD-002', name: 'Mouse', price: 29.99, stock: 2, reorderLevel: 10 },
    { id: '3', sku: 'PROD-003', name: 'Keyboard', price: 79.99, stock: 50, reorderLevel: 15 }
  ];

  for (const product of products) {
    await db.insert(Product).values({
      ...product,
      lastRestockAt: new Date(),
      createdAt: new Date()
    });
  }

  // Productos con stock bajo
  const lowStock = await db
    .select()
    .from(Product)
    .where(
      and(
        lt('stock', 5),
        gte('reorderLevel', 5)
      )
    );

  console.log('Low stock items:', lowStock);

  // Reordenar producto
  await db
    .update(Product)
    .set({ stock: 25, lastRestockAt: new Date() })
    .where(sku('PROD-002'));

  // Valor total de inventario
  const totalValue = await db.$sum(Product, 'price');
  console.log(`Inventory value: $${totalValue}`);

  // Artículos críticos
  const critical = await db.$count(Product, lt('stock', 'reorderLevel'));
  console.log(`Critical items: ${critical}`);

  await db.close();
}

main().catch(console.error);
```

## User Analytics

Análisis de usuarios.

```ts
import {
  gitDb,
  entity,
  uuid,
  text,
  int,
  bool,
  timestamp,
  gte,
  lt,
  eq,
  and
} from '@kettu/gitdb';

const User = entity('users', {
  id: uuid().primary(),
  email: text().unique(),
  name: text(),
  age: int(),
  isActive: bool(),
  createdAt: timestamp(),
  lastLoginAt: timestamp()
});

async function main() {
  const db = await gitDb({
    dir: './analytics',
    author: { name: 'Analytics', email: 'analytics@example.com' }
  });

  // Crear usuarios
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < 100; i++) {
    await db.insert(User).values({
      id: `user-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      age: 20 + Math.floor(Math.random() * 50),
      isActive: Math.random() > 0.3,
      createdAt: new Date(sixMonthsAgo.getTime() + Math.random() * 180 * 24 * 60 * 60 * 1000),
      lastLoginAt: new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    });
  }

  // Análisis
  const totalUsers = await db.$count(User);
  const activeUsers = await db.$count(User, eq('isActive', true));
  const avgAge = await db.$avg(User, 'age');
  const minors = await db.$count(User, lt('age', 18));
  const seniors = await db.$count(User, gte('age', 65));

  console.log(`Total users: ${totalUsers}`);
  console.log(`Active users: ${activeUsers}`);
  console.log(`Average age: ${avgAge?.toFixed(1)}`);
  console.log(`Minors: ${minors}`);
  console.log(`Seniors: ${seniors}`);

  await db.close();
}

main().catch(console.error);
```

## Next Steps

- [Getting Started](Getting-Started) - Tutorial completo
- [API Reference](API-Reference) - Todas las APIs
