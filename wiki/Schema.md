# Schema Definition

Documentación completa sobre cómo definir esquemas de entidades.

## Entity Builder

### `entity(name, columns)`

Define una entidad con su nombre y columnas.

```ts
import { entity, uuid, text, int } from '@kettu/gitdb';

const User = entity('users', {
  id: uuid().primary(),
  name: text(),
  age: int()
});
```

## Column Types

### Text Types

#### `text()`
Texto ilimitado. Ideal para descripciones y contenido largo.

```ts
const description = text();
```

#### `varchar(length?)`
Texto con límite opcional de caracteres.

```ts
const username = varchar(50);
const email = varchar(255);
```

#### `char(length)`
Texto de longitud fija (rellena con espacios).

```ts
const code = char(10);
```

### Numeric Types

#### `int()` / `integer()`
Entero de 32 bits. Rango: -2,147,483,648 a 2,147,483,647

```ts
const age = int();
const score = integer();
```

#### `bigint()`
Entero de 64 bits. Para números muy grandes.

```ts
const largeNumber = bigint();
```

#### `numeric(precision, scale)`
Decimal de precisión arbitraria. Ideal para dinero.

```ts
const price = numeric(10, 2); // 10 dígitos, 2 decimales
const salary = numeric(15, 2);
```

#### `real()` / `double()` / `doublePrecision()`
Números decimales de punto flotante.

```ts
const height = real();
const weight = double();
const temperature = doublePrecision();
```

### Boolean Types

#### `bool()` / `boolean()`
Valores verdadero/falso.

```ts
const isActive = bool();
const isAdmin = boolean();
```

### Date/Time Types

#### `date()`
Solo la fecha, sin hora.

```ts
const birthDate = date();
const createdDate = date();
```

#### `timestamp()`
Fecha y hora completa (ISO 8601).

```ts
const createdAt = timestamp();
const updatedAt = timestamp();
const deletedAt = timestamp(); // Para soft deletes
```

### Special Types

#### `uuid()`
UUID/GUID único. Ideal para IDs distribuidos.

```ts
const id = uuid().primary();
```

#### `json()`
Objeto JSON. Permite estructura flexible.

```ts
const metadata = json();
const config = json();
```

## Column Modifiers

### Primary Key

```ts
const id = uuid().primary();
const userId = int().primary();
```

### Unique

```ts
const email = text().unique();
const username = varchar(50).unique();
```

## Full Example

```ts
import {
  entity,
  uuid,
  text,
  varchar,
  int,
  numeric,
  timestamp,
  bool,
  json
} from '@kettu/gitdb';

export const User = entity('users', {
  id: uuid().primary(),
  email: text().unique(),
  username: varchar(50).unique(),
  firstName: text(),
  lastName: text(),
  age: int(),
  isActive: bool(),
  metadata: json(),
  createdAt: timestamp(),
  updatedAt: timestamp()
});

export const Product = entity('products', {
  id: uuid().primary(),
  sku: varchar(20).unique(),
  name: text(),
  description: text(),
  price: numeric(10, 2),
  stock: int(),
  rating: real(),
  tags: json(),
  createdAt: timestamp()
});
```

## Next Steps

- [Query API](Queries) - Usar las entidades
- [Relations](Relations) - Conectar entidades
