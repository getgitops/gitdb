# Publishing & Release

Guía completa para publicar nuevas versiones en NPM usando changesets.

## What is Changesets?

**Changesets** es un sistema automático de versionado semántico. En lugar de decidir la versión manualmente:

1. Tú describes los cambios en un archivo `.changeset`
2. GitHub Actions crea automáticamente un PR de versión
3. El merge del PR publica automáticamente en NPM

## Workflow Completo

### 1. Hacer Cambios

Desarrolla normalmente en tu rama:

```bash
git checkout -b feature/new-feature
# Edita archivos...
git add .
git commit -m "feat: agregar nueva funcionalidad"
```

### 2. Crear Changeset

Cuando terminaste los cambios, crea un changeset:

```bash
npm run changeset
```

Se abrirá un prompt interactivo:

```
? Which packages would you like to include? (Use arrow keys)
❯ @kettu/gitdb

? Which change type should this be? (Use arrow keys)
❯ patch (0.0.x) - Bug fixes
  minor (0.x.0) - New features
  major (x.0.0) - Breaking changes

? Please provide a summary of the changes
(Be concise - this will be used in the changelog)
❯ Add support for custom operators
```

**Nota:** Puedes crear múltiples changesets si el PR toca varias cosas.

### 3. Commit y Push

```bash
git add .changeset/
git commit -m "chore: changeset for new feature"
git push origin feature/new-feature
```

### 4. GitHub Actions Automático

Cuando haces push a `main` o `develop`:

1. GitHub Actions detecta los archivos `.changeset`
2. Crea automáticamente un PR llamado "chore: release version"
3. El PR actualiza `package.json` version y `CHANGELOG.md`

### 5. Merge PR y Publicación

```bash
# En GitHub:
# 1. Review el PR automático
# 2. Click "Merge pull request"
```

GitHub Actions automáticamente:
1. Ejecuta tests
2. Publica en NPM
3. Crea un tag Git (ej: `@kettu/gitdb@0.2.0`)
4. Crea un Release en GitHub

## Manual Publishing

Si necesitas publicar manualmente:

```bash
npm run release
```

Esto:
1. Corre type check y tests
2. Corre build
3. Incrementa versión automáticamente
4. Publica en NPM

## Changeset Files

Después de `npm run changeset`, se crea un archivo en `.changeset/`:

```
.changeset/
├── lazy-lions-yell.md (changeset ID único)
└── config.json
```

### Contenido del changeset

```markdown
---
"@kettu/gitdb": patch
---

Add support for custom WHERE operators and improve query performance
```

**Formato:**
- Primera línea después de `---`: `"package-name": change-type`
- Después: descripción del cambio (usada en changelog)

## Change Types

- **patch** (0.0.x): Bug fixes, improvements sin cambios en API
  ```bash
  npm run changeset
  # Seleccionar: patch
  ```

- **minor** (0.x.0): Nuevas features, backward compatible
  ```bash
  npm run changeset
  # Seleccionar: minor
  ```

- **major** (x.0.0): Breaking changes
  ```bash
  npm run changeset
  # Seleccionar: major
  ```

## Example Workflow

### Bug Fix

```bash
# 1. Arreglar bug
git checkout -b fix/null-pointer
# ... edita archivo ...

# 2. Crear changeset
npm run changeset
# Seleccionar: patch
# Describir: "Fix null pointer exception in select queries"

# 3. Push
git add . && git commit -m "fix: null pointer in queries"
git push origin fix/null-pointer

# 4. GitHub Actions automáticamente:
#    - Crea PR de versión (0.1.0 → 0.1.1)
#    - Espera merge
#    - Publica en NPM
```

### New Feature

```bash
# 1. Agregar feature
git checkout -b feat/aggregations
# ... edita archivo ...

# 2. Crear changeset
npm run changeset
# Seleccionar: minor
# Describir: "Add COUNT, SUM, AVG aggregation functions"

# 3. Push y merge
git add . && git commit -m "feat: add aggregations"
git push origin feat/aggregations

# 4. GitHub Actions automáticamente:
#    - Crea PR de versión (0.1.1 → 0.2.0)
#    - Publica en NPM
```

## Configuration

El archivo `.changeset/config.json` configura el comportamiento:

```json
{
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "develop",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

**Opciones importantes:**
- `baseBranch`: Rama de donde hacer releases (develop)
- `access`: "public" para publicar en NPM público
- `changelog`: Cómo generar CHANGELOG.md

## Environment Variables

Necesitas configurar en GitHub Settings → Secrets:

### NPM_TOKEN

Token de autenticación para publicar en NPM:

1. Ve a https://npmjs.com → Account → Auth Tokens
2. Crea un token con permisos "Publish"
3. Copia el token
4. En GitHub Repo → Settings → Secrets → New secret
5. Nombre: `NPM_TOKEN`
6. Valor: Pega el token

```yaml
# En los workflows se usa así:
env:
  NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Workflow Automático (GitHub Actions)

El archivo `changesets-release.yml` ejecuta:

```yaml
on:
  push:
    branches:
      - main
      - develop  # Detecta changesets en estas ramas
```

El workflow automáticamente:
1. Detecta si hay archivos en `.changeset/`
2. Crea un PR de "chore: release version"
3. El merge automáticamente publica en NPM

## Checking Release Status

Después de hacer push:

1. Ve al tab "Actions" en GitHub
2. Busca el workflow "Release with Changesets"
3. Si pasa, habrá un PR nuevo (buscable con: "chore: release")
4. Review y merge el PR

## Rollback

Si necesitas revertir una publicación:

```bash
# Revertir commit en Git
git revert <commit-hash>
git push

# Crear changeset para rollback
npm run changeset
# Descripción: Revert version X.Y.Z - reason
```

## Troubleshooting

### PR de versión no se crea

**Problema:** Hiciste push pero el PR no aparece en 24h

**Solución:**
1. Verifica que `.changeset/*.md` existe
2. Verifica el workflow en el tab "Actions"
3. Cheque los logs del workflow

### Publicación falla

**Problema:** El workflow falla en "Publish to NPM"

**Solución:**
1. Verifica `NPM_TOKEN` en GitHub Secrets
2. Verifica que el token está válido (check en npmjs.com)
3. Verifica permisos en `publishConfig` de package.json

### Version incorrecta

**Problema:** El changeset incrementó la versión incorrectamente

**Solución:**
1. Elimina el PR de versión
2. Elimina los archivos en `.changeset/`
3. Crea nuevos changesets correctos

## Best Practices

1. **Un changeset por PR** - Describir cambios coherentes
2. **Descripciones claras** - Títulos que aparecerán en CHANGELOG
3. **No pushes version bumps** - Deja que changesets lo haga
4. **Review el PR de versión** - Verifica CHANGELOG antes de merge
5. **Test antes de changeset** - Asegúrate que tests pasen

## Next Steps

- [Getting Started](Getting-Started) - Primeros pasos
- [API Reference](API-Reference) - Documentación completa
