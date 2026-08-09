# RM SELECT

Plataforma web para RM SELECT, emprendimiento colombiano dedicado a la venta de relojes, joyería y accesorios.

## Visión

Construir una plataforma comercial escalable que permita mostrar el catálogo, gestionar carritos y pedidos, controlar inventario, administrar clientes y facilitar la operación del negocio.

## Stack inicial

- HTML5
- CSS3
- JavaScript Vanilla
- Supabase / PostgreSQL
- Cloudinary
- GitHub Pages

## Funcionalidades previstas

- Catálogo y categorías
- Productos y variantes
- Carrito de compras
- Checkout
- Pedidos y seguimiento de estados
- Pagos por transferencia (Nequi / Bancolombia)
- Confirmación manual mediante comprobante por WhatsApp
- Inventario y reservas temporales
- Auditoría de movimientos de inventario
- Pedidos registrados manualmente desde WhatsApp
- Cuentas opcionales para clientes
- Panel administrativo
- Reseñas verificadas
- Promociones y beneficios de registro
- Español por defecto e inglés preparado
- SEO y diseño responsive

## Roles

- `SUPER_ADMIN`: un único administrador principal.
- `ADMIN`: máximo tres administradores operativos.
- `CUSTOMER`: cliente registrado.
- `GUEST`: cliente sin cuenta.

## Desarrollo

La aplicación está diseñada para funcionar inicialmente como sitio estático en GitHub Pages, utilizando Supabase como backend gestionado y Cloudinary para los recursos multimedia.

> No almacenar secretos privados, service-role keys ni credenciales administrativas en el frontend.
