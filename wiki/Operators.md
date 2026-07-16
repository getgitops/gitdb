# WHERE Operators

Operadores para filtrar datos en queries.

## Comparison Operators

### `eq(field, value)`

Igualdad exacta.

```ts
// Obtener usuario con id específico
await db.select().from(User).where(eq('id', 'uuid-1'));

// Obtener usuarios de 30 años
await db.select().from(User).where(eq('age', 30));
```

### `ne(field, value)`

No igual.

```ts
// Usuarios que NO tienen 30 años
await db.select().from(User).where(ne('age', 30));

// Usuarios que NO son admin
await db.select().from(User).where(ne('role', 'admin'));
```

### `gt(field, value)`

Mayor que (>).

```ts
// Usuarios mayores de 18 años
await db.select().from(User).where(gt('age', 18));
```

### `gte(field, value)`

Mayor o igual (>=).

```ts
// Usuarios de 18 años o más
await db.select().from(User).where(gte('age', 18));

// Productos con precio >= $100
await db.select().from(Product).where(gte('price', 100));
```

### `lt(field, value)`

Menor que (<).

```ts
// Usuarios menores de 65 años
await db.select().from(User).where(lt('age', 65));
```

### `lte(field, value)`

Menor o igual (<=).

```ts
// Descuentos para usuarios <= 12 años
await db.select().from(User).where(lte('age', 12));
```

## String Operators

### `ilike(field, pattern)`

Búsqueda case-insensitive con wildcards.

```ts
// Emails que contienen 'example.com'
await db
  .select()
  .from(User)
  .where(ilike('email', '%example.com'));

// Nombres que empiezan con 'John'
await db
  .select()
  .from(User)
  .where(ilike('name', 'John%'));

// Emails que terminan con '.org'
await db
  .select()
  .from(User)
  .where(ilike('email', '%.org'));
```

## Logical Operators

### `and(...predicates)`

Todas las condiciones deben cumplirse (AND lógico).

```ts
import { and, eq, gte, ilike } from '@kettu/gitdb';

await db
  .select()
  .from(User)
  .where(
    and(
      gte('age', 18),
      eq('isActive', true),
      ilike('email', '%@example.com')
    )
  );
```

### `or(...predicates)`

Al menos una condición debe cumplirse (OR lógico).

```ts
import { or, eq } from '@kettu/gitdb';

await db
  .select()
  .from(User)
  .where(
    or(
      eq('role', 'admin'),
      eq('role', 'moderator'),
      eq('role', 'superuser')
    )
  );
```

### `not(predicate)`

Negación lógica.

```ts
import { not, eq } from '@kettu/gitdb';

// Usuarios que NO son admins
await db
  .select()
  .from(User)
  .where(not(eq('role', 'admin')));
```

## Complex Queries

### Combinando múltiples operadores

```ts
import { and, or, eq, gte, ilike } from '@kettu/gitdb';

// (age >= 18 AND role = 'admin') OR (age >= 21 AND status = 'verified')
await db
  .select()
  .from(User)
  .where(
    or(
      and(
        gte('age', 18),
        eq('role', 'admin')
      ),
      and(
        gte('age', 21),
        eq('status', 'verified')
      )
    )
  );
```

### Email con múltiples dominios

```ts
import { or, ilike } from '@kettu/gitdb';

await db
  .select()
  .from(User)
  .where(
    or(
      ilike('email', '%@gmail.com'),
      ilike('email', '%@outlook.com'),
      ilike('email', '%@example.com')
    )
  );
```

### Búsqueda avanzada

```ts
import { and, or, ilike, gte } from '@kettu/gitdb';

const searchTerm = 'john';
const minAge = 18;

await db
  .select()
  .from(User)
  .where(
    and(
      or(
        ilike('name', `%${searchTerm}%`),
        ilike('email', `%${searchTerm}%`)
      ),
      gte('age', minAge)
    )
  );
```

## Type Safety

Todos los operadores son type-safe:

```ts
const user = await db.select().from(User);
// Error de compilación si 'nonexistent' no existe
await db.select().from(User).where(eq('nonexistent', 'value'));
```

## Performance Tips

1. **Usa índices** en campos que filtras frecuentemente
2. **Limita resultados** combinando múltiples predicados
3. **Evita wildcards al inicio** en ilike (%, por ejemplo: '%term' es lento)

## Next Steps

- [Query API](Queries) - Operaciones CRUD
- [Aggregations](Aggregations) - COUNT, SUM, AVG
