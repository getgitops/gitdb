# Relations

Define y usa relaciones entre entidades.

## Definir Relaciones

### One-to-Many Relation

```ts
import { defineRelations } from '@kettu/gitdb';

defineRelations(User, {
  posts: {
    type: 'many',
    entity: Post,
    foreignKey: 'userId'
  }
});
```

Un usuario tiene muchos posts.

### Many-to-One Relation

```ts
defineRelations(Post, {
  author: {
    type: 'one',
    entity: User,
    foreignKey: 'userId'
  }
});
```

Muchos posts pertenecen a un usuario.

## Full Example

```ts
import { entity, uuid, text, defineRelations } from '@kettu/gitdb';

// Entidades
const User = entity('users', {
  id: uuid().primary(),
  name: text(),
  email: text()
});

const Post = entity('posts', {
  id: uuid().primary(),
  userId: uuid(),
  title: text(),
  content: text()
});

const Comment = entity('comments', {
  id: uuid().primary(),
  postId: uuid(),
  userId: uuid(),
  text: text()
});

// Relaciones
defineRelations(User, {
  posts: {
    type: 'many',
    entity: Post,
    foreignKey: 'userId'
  },
  comments: {
    type: 'many',
    entity: Comment,
    foreignKey: 'userId'
  }
});

defineRelations(Post, {
  author: {
    type: 'one',
    entity: User,
    foreignKey: 'userId'
  },
  comments: {
    type: 'many',
    entity: Comment,
    foreignKey: 'postId'
  }
});

defineRelations(Comment, {
  author: {
    type: 'one',
    entity: User,
    foreignKey: 'userId'
  },
  post: {
    type: 'one',
    entity: Post,
    foreignKey: 'postId'
  }
});
```

## Using Relations with Include

### Load Single Relation

```ts
const user = await db
  .select()
  .from(User)
  .where(eq('id', 'user-1'))
  .include({
    posts: true
  });

// user.posts contiene todos los posts del usuario
```

### Load Multiple Relations

```ts
const user = await db
  .select()
  .from(User)
  .where(eq('id', 'user-1'))
  .include({
    posts: true,
    comments: true
  });
```

### Nested Relations

```ts
const user = await db
  .select()
  .from(User)
  .where(eq('id', 'user-1'))
  .include({
    posts: {
      include: {
        comments: true
      }
    }
  });

// Acceder a comments del post
user.posts.forEach(post => {
  console.log(post.comments);
});
```

### Load from Many-to-One

```ts
const post = await db
  .select()
  .from(Post)
  .where(eq('id', 'post-1'))
  .include({
    author: true  // Carga el usuario que escribió el post
  });

console.log(post.author.name);
```

## Creating with Relations

### Crear usuario y sus posts

```ts
// Primero crear usuario
const userId = 'user-1';
await db.insert(User).values({
  id: userId,
  name: 'John Doe',
  email: 'john@example.com'
});

// Luego crear posts con referencia
await db.insert(Post).values({
  id: 'post-1',
  userId: userId,
  title: 'First Post',
  content: '...'
});

await db.insert(Post).values({
  id: 'post-2',
  userId: userId,
  title: 'Second Post',
  content: '...'
});
```

## Deleting with Relations

Al eliminar, cuida las relaciones:

```ts
// Opción 1: Eliminar primero los posts
await db.delete().from(Post).where(eq('userId', 'user-1'));

// Luego eliminar usuario
await db.delete().from(User).where(eq('id', 'user-1'));

// Opción 2: Soft delete (agregar campo deletedAt)
await db
  .update(User)
  .set({ deletedAt: new Date() })
  .where(eq('id', 'user-1'));
```

## Querying Through Relations

### Obtener posts de un usuario específico

```ts
const userPosts = await db
  .select()
  .from(Post)
  .where(eq('userId', 'user-1'));
```

### Obtener todos los comentarios de un usuario

```ts
const userComments = await db
  .select()
  .from(Comment)
  .where(eq('userId', 'user-1'));
```

### Obtener posts con comentarios

```ts
const posts = await db
  .select()
  .from(Post)
  .include({
    comments: true
  });

posts.forEach(post => {
  console.log(`Post "${post.title}" has ${post.comments.length} comments`);
});
```

## Best Practices

1. **Mantén IDs consistentes** - Usa UUID o secuencias consistentes
2. **Define ambos lados** - Si A → B, también define B ← A
3. **Lazy load cuando sea posible** - No cargues relaciones innecesarias
4. **Maneja huérfanos** - Cuando eliminas padre, ¿qué pasa con los hijos?
5. **Usa includeRelations** - Carga relaciones en una sola query

## Limitations

- No hay cascada automática (debes manejar manualmente)
- No hay restricciones de integridad referencial (validar en app)
- Las relaciones se cargan en memoria (cuidado con grandes datasets)

## Next Steps

- [Query API](Queries) - Operaciones CRUD
- [Aggregations](Aggregations) - COUNT, SUM, AVG
