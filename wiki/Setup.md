# Setup & Configuration

Instrucciones para configurar GitHub Actions y CI/CD.

## GitHub Actions Workflows

Se han creado tres workflows automáticos en `.github/workflows/`:

### 1. test.yml - Tests en Push

**Cuándo se ejecuta:**
- En cada `push` a `main` o `develop`
- En cada `pull_request` a `main` o `develop`

**Qué hace:**
- Instala Node.js (versiones 20 y 22)
- Instala dependencias
- Ejecuta type check: `npm run typecheck`
- Ejecuta tests: `npm run test`
- Sube coverage a Codecov

**Requisitos:** Ninguno extra, funcionará automáticamente

### 2. publish-npm.yml - Publicar en NPM

**Cuándo se ejecuta:**
- En `push` a `main`
- Con tags `gitdb-vX.Y.Z`
- Manual vía `workflow_dispatch`

**Qué hace:**
- Verifica type check y tests
- Build del proyecto
- Publica en NPM

**Requisitos:**
- Configurar `NPM_TOKEN` en GitHub Secrets

### 3. changesets-release.yml - Release Automático

**Cuándo se ejecuta:**
- En cada `push` a `main` o `develop`
- Detecta archivos en `.changeset/`

**Qué hace:**
- Si hay changesets: Crea PR de versión automático
- Al hacer merge del PR: Publica automáticamente en NPM

**Requisitos:**
- Configurar `NPM_TOKEN` en GitHub Secrets

## Configurar NPM_TOKEN

### Paso 1: Generar Token en NPM

1. Ve a https://npmjs.com
2. Click en tu avatar → "Account"
3. Izquierda: "Auth Tokens"
4. Click "Generate New Token" → "Automation"
5. Copia el token

### Paso 2: Agregar a GitHub Secrets

1. Ve a tu repo en GitHub
2. Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Nombre: `NPM_TOKEN`
5. Valor: Pega el token de NPM
6. Click "Add secret"

### Paso 3: Verificar

Los workflows usarán automáticamente el token:

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## Workflow de Desarrollo

### Para Bug Fixes y Features Pequeños

```bash
# 1. Crear rama
git checkout -b fix/bug-name

# 2. Hacer cambios
# ... edita archivos ...
npm run test  # Verifica que tests pasen

# 3. Crear changeset
npm run changeset
# Selecciona: patch para bug fixes
# Describe el cambio

# 4. Push
git add .changeset/
git commit -m "fix: descripción del bug"
git push origin fix/bug-name

# 5. GitHub Actions automáticamente:
#    ✅ Ejecuta tests
#    ✅ Verifica types
#    ✅ Crea PR de versión
#    ✅ Al mergear → Publica en NPM
```

### Para Nuevas Features

```bash
git checkout -b feat/feature-name
# ... edita archivos ...
npm run test

npm run changeset
# Selecciona: minor para nuevas features
# Describe el cambio

git add .changeset/
git commit -m "feat: descripción"
git push origin feat/feature-name

# GitHub Actions:
# ✅ Ejecuta tests
# ✅ Crea PR de versión (incrementa 0.x.0)
# ✅ Publica en NPM
```

### Para Breaking Changes

```bash
git checkout -b feat/breaking-change
# ... edita archivos ...
npm run test

npm run changeset
# Selecciona: major para breaking changes
# Describe el cambio

git add .changeset/
git commit -m "feat!: descripción del breaking change"
git push origin feat/breaking-change

# GitHub Actions:
# ✅ Crea PR de versión (incrementa x.0.0)
# ✅ Publica en NPM
```

## Monitorear Releases

### En GitHub

1. Ve al tab "Actions"
2. Busca el workflow "Release with Changesets"
3. Verifica que el workflow pasó

### En NPM

```bash
# Ver últimas versiones publicadas
npm view @kettu/gitdb versions
```

## Troubleshooting

### El workflow falla en "Publish to NPM"

**Problema:** Error de autenticación

**Solución:**
1. Verifica que `NPM_TOKEN` existe en GitHub Secrets
2. Verifica que el token no expiró en npmjs.com
3. Regenera el token si es necesario

### No se crea PR de versión

**Problema:** Los changesets no se detectan

**Solución:**
1. Verifica que los archivos están en `.changeset/`
2. Verifica que el push fue a `main` o `develop`
3. Mira los logs en GitHub Actions

### "Git not found" en tests

**Problema:** Git no está disponible en CI

**Solución:** Agregamos Git al workflow en `test.yml`

## Archivos Creados

```
.github/
└── workflows/
    ├── test.yml                 # Tests en push/PR
    ├── publish-npm.yml          # Publicar manualmente
    └── changesets-release.yml   # Release automático
```

## Variables de Ambiente

### En CI

Automáticamente disponibles:
- `GITHUB_TOKEN` - Acceso al repo
- `NODE_AUTH_TOKEN` - Token de NPM (si configurado)

### Localmente

Para tests locales con Git:

```bash
git config --global user.name "Local Dev"
git config --global user.email "dev@example.com"
npm run test
```

## Next Steps

- [Publishing](Publishing) - Cómo publicar releases
- [Getting Started](Getting-Started) - Primeros pasos
- [FAQ](FAQ) - Preguntas frecuentes
