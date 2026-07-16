# Aggregations

Funciones de agregación: COUNT, SUM, AVG.

## Count

Contar registros con filtros opcionales.

### Contar Todos

```ts
const totalUsers = await db.$count(User);
```

### Contar con Filtro

```ts
// Usuarios mayores de 18
const adults = await db.$count(User, gte('age', 18));

// Usuarios activos
const activeUsers = await db.$count(User, eq('isActive', true));

// Múltiples condiciones
const filtered = await db.$count(
  User,
  and(
    gte('age', 18),
    eq('status', 'verified')
  )
);
```

## Sum

Sumar valores de un campo.

### Sumar Todo

```ts
const totalAge = await db.$sum(User, 'age');
const totalPrice = await db.$sum(Product, 'price');
```

### Sumar con Filtro

```ts
// Suma de precios de productos en stock
const inventoryValue = await db.$sum(
  Product,
  'price',
  gt('stock', 0)
);

// Total de edad de usuarios mayores
const seniorAge = await db.$sum(
  User,
  'age',
  gte('age', 65)
);

// Múltiples condiciones
const filtered = await db.$sum(
  Product,
  'price',
  and(
    eq('category', 'electronics'),
    lt('price', 1000)
  )
);
```

## Average

Promedio de valores en un campo.

### Promedio Simple

```ts
const avgAge = await db.$avg(User, 'age');
const avgPrice = await db.$avg(Product, 'price');
```

### Promedio con Filtro

```ts
// Edad promedio de adultos
const adultAvgAge = await db.$avg(User, 'age', gte('age', 18));

// Precio promedio de productos premium
const premiumAvgPrice = await db.$avg(
  Product,
  'price',
  eq('category', 'premium')
);

// Múltiples condiciones
const avgFiltered = await db.$avg(
  Product,
  'price',
  and(
    eq('inStock', true),
    gte('rating', 4)
  )
);
```

## Practical Examples

### E-commerce Analytics

```ts
import { eq, gt, and, gte } from '@kettu/gitdb';

const db = await gitDb({/* config */});

// Métricas de productos
const totalProducts = await db.$count(Product);
const productsInStock = await db.$count(Product, gt('stock', 0));
const totalInventoryValue = await db.$sum(Product, 'price');
const avgPrice = await db.$avg(Product, 'price');

// Productos premium
const premiumCount = await db.$count(Product, eq('category', 'premium'));
const premiumValue = await db.$sum(Product, 'price', eq('category', 'premium'));

console.log(`Total products: ${totalProducts}`);
console.log(`In stock: ${productsInStock}`);
console.log(`Inventory value: $${totalInventoryValue}`);
console.log(`Average price: $${avgPrice?.toFixed(2)}`);
```

### User Analytics

```ts
import { gte, lt, and } from '@kettu/gitdb';

// Usuarios por rangos de edad
const minors = await db.$count(User, lt('age', 18));
const adults = await db.$count(User, and(gte('age', 18), lt('age', 65)));
const seniors = await db.$count(User, gte('age', 65));

// Edades promedio
const avgAgeAll = await db.$avg(User, 'age');
const avgAdultAge = await db.$avg(User, 'age', gte('age', 18));

console.log(`Minors: ${minors}`);
console.log(`Adults: ${adults}`);
console.log(`Seniors: ${seniors}`);
console.log(`Average age: ${avgAgeAll}`);
```

### Financial Reporting

```ts
import { eq, gte, lt } from '@kettu/gitdb';

// Reportes de ventas
const totalSales = await db.$sum(Order, 'amount');
const avgOrderValue = await db.$avg(Order, 'amount');
const largeOrders = await db.$count(Order, gte('amount', 1000));

// Por categoría
const categorySales = {};
for (const cat of ['electronics', 'books', 'clothing']) {
  categorySales[cat] = await db.$sum(Order, 'amount', eq('category', cat));
}

console.log('Category Sales:', categorySales);
console.log(`Average order: $${avgOrderValue}`);
```

## Return Values

- `$count()` - Devuelve number
- `$sum()` - Devuelve number (0 si no hay registros)
- `$avg()` - Devuelve number | null (null si no hay registros)

## Performance Considerations

1. Las agregaciones se calculan en memoria
2. Para datasets muy grandes, considera filtrar primero
3. Las agregaciones sin filtro pueden ser lentas si hay muchos registros

## Next Steps

- [Query API](Queries) - Operaciones CRUD
- [WHERE Operators](Operators) - Filtros avanzados
