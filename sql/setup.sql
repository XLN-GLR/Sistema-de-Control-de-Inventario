-- ====================================================================
-- SCRIPT DE CONFIGURACIÓN DE BASE DE DATOS (SUPABASE / POSTGRESQL)
-- Proyecto: Sistema de Control de Inventario y Alertas - Tienda de Abarrotes
-- ====================================================================

-- 1. LIMPIEZA DE TABLAS PREVIAS (Por si se vuelve a ejecutar)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.es_admin();
drop table if exists public.detalles_pedido;
drop table if exists public.pedidos;
drop table if exists public.productos;
drop table if exists public.profiles;

-- 2. CREACIÓN DE LA TABLA DE PERFILES
-- Esta tabla está enlazada con la autenticación nativa de Supabase (auth.users)
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    email text not null,
    nombre text,
    rol text not null default 'cliente' check (rol in ('admin', 'cliente')),
    creado_en timestamp with time zone default now()
);

-- Habilitar Row Level Security (RLS) en profiles
alter table public.profiles enable row level security;

-- 3. CREACIÓN DE LA TABLA DE PRODUCTOS (INVENTARIO)
create table public.productos (
    id uuid default gen_random_uuid() primary key,
    nombre text not null,
    categoria text not null,
    precio numeric(10, 2) not null check (precio >= 0),
    stock integer not null check (stock >= 0),
    stock_minimo integer not null default 5 check (stock_minimo >= 0),
    imagen_url text,
    codigo_barras text,
    creado_en timestamp with time zone default now()
);

-- Habilitar RLS en productos
alter table public.productos enable row level security;

-- 4. CREACIÓN DE LA TABLA DE PEDIDOS
create table public.pedidos (
    id uuid default gen_random_uuid() primary key,
    cliente_id uuid references public.profiles(id) on delete cascade not null,
    total numeric(10, 2) not null check (total >= 0),
    estado text not null default 'pendiente' check (estado in ('pendiente', 'completado', 'cancelado')),
    creado_en timestamp with time zone default now()
);

-- Habilitar RLS en pedidos
alter table public.pedidos enable row level security;

-- 5. CREACIÓN DE LA TABLA DE DETALLES DE PEDIDO
create table public.detalles_pedido (
    id uuid default gen_random_uuid() primary key,
    pedido_id uuid references public.pedidos(id) on delete cascade not null,
    producto_id uuid references public.productos(id) on delete restrict not null,
    cantidad integer not null check (cantidad > 0),
    precio_unitario numeric(10, 2) not null check (precio_unitario >= 0)
);

-- Habilitar RLS en detalles_pedido
alter table public.detalles_pedido enable row level security;

-- ====================================================================
-- FUNCIONES AUXILIARES Y TRIGGERS (LÓGICA DEL SERVIDOR)
-- ====================================================================

-- Función para verificar si el usuario conectado es Administrador
create or replace function public.es_admin()
returns boolean as $$
begin
    return exists (
        select 1 from public.profiles
        where id = auth.uid() and rol = 'admin'
    );
end;
$$ language plpgsql security definer;

-- Función trigger para registrar automáticamente el perfil cuando se crea un usuario en auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, email, nombre, rol)
    values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
        case 
            when new.email = 'bjacnier28giler@gmail.com' then 'admin'
            else 'cliente'
        end
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger para ejecutar la función handle_new_user tras la inserción en auth.users
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ====================================================================
-- POLÍTICAS DE ROW LEVEL SECURITY (RLS) - SEGURIDAD DE DATOS
-- ====================================================================

-- --- POLÍTICAS PARA PROFILES ---
-- Permitir que cualquier usuario autenticado lea perfiles (para cargar nombres en pedidos)
create policy "Cualquiera autenticado puede leer perfiles"
    on public.profiles for select
    to authenticated
    using (true);

-- Permitir que los usuarios actualicen su propio perfil o que lo haga un admin
create policy "Usuarios pueden actualizar su propio perfil"
    on public.profiles for update
    to authenticated
    using (auth.uid() = id or public.es_admin());

-- --- POLÍTICAS PARA PRODUCTOS ---
-- Permitir lectura pública de productos (para que visitantes y clientes vean el catálogo)
create policy "Cualquiera puede ver productos"
    on public.productos for select
    to public
    using (true);

-- Permitir inserción, actualización y eliminación de productos SOLO a Administradores
create policy "Solo administradores pueden crear productos"
    on public.productos for insert
    to authenticated
    with check (public.es_admin());

create policy "Solo administradores pueden modificar productos"
    on public.productos for update
    to authenticated
    using (public.es_admin())
    with check (public.es_admin());

create policy "Solo administradores pueden eliminar productos"
    on public.productos for delete
    to authenticated
    using (public.es_admin());

-- --- POLÍTICAS PARA PEDIDOS ---
-- Permitir que los clientes lean sus propios pedidos y los administradores todos
create policy "Usuarios pueden ver sus propios pedidos o admin todos"
    on public.pedidos for select
    to authenticated
    using (auth.uid() = cliente_id or public.es_admin());

-- Permitir que los clientes inserten sus propios pedidos
create policy "Clientes pueden registrar sus propios pedidos"
    on public.pedidos for insert
    to authenticated
    with check (auth.uid() = cliente_id);

-- Permitir que los administradores actualicen el estado de los pedidos (completar/cancelar)
create policy "Solo administradores pueden actualizar pedidos"
    on public.pedidos for update
    to authenticated
    using (public.es_admin());

-- --- POLÍTICAS PARA DETALLES DE PEDIDO ---
-- Permitir ver detalles de pedido si el pedido pertenece al usuario o es administrador
create policy "Usuarios pueden ver detalles de sus propios pedidos o admin"
    on public.detalles_pedido for select
    to authenticated
    using (
        exists (
            select 1 from public.pedidos 
            where id = pedido_id and (cliente_id = auth.uid() or public.es_admin())
        )
    );

-- Permitir insertar detalles de pedido si pertenecen a un pedido propio del usuario
create policy "Usuarios pueden agregar detalles a su pedido"
    on public.detalles_pedido for insert
    to authenticated
    with check (
        exists (
            select 1 from public.pedidos 
            where id = pedido_id and cliente_id = auth.uid()
        )
    );

-- ====================================================================
-- DATOS INICIALES DE PRUEBA (PRODUCTOS DE ABARROTES)
-- ====================================================================
insert into public.productos (nombre, categoria, precio, stock, stock_minimo, imagen_url, codigo_barras)
values
('Leche Entera 1L', 'Lácteos', 1.80, 25, 8, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&q=80&w=400', '7501020561234'),
('Pan de Caja Integral', 'Panadería', 2.50, 4, 6, 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=400', '7501030465432'), -- Alerta de stock bajo (4 <= 6)
('Arroz Blanco Súper 1kg', 'Granos y Semillas', 1.60, 40, 10, 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400', '7501040371239'),
('Aceite Vegetal de Cocina 1L', 'Despensa', 3.20, 15, 5, 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=400', '7501050284561'),
('Café Soluble Premium 200g', 'Despensa', 5.90, 3, 5, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=400', '7501060191238'), -- Alerta de stock bajo (3 <= 5)
('Refresco Cola 2.5L', 'Bebidas', 2.10, 30, 8, 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=400', '7501070992341'),
('Papas Fritas Crujientes 150g', 'Snacks', 1.40, 18, 5, 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&q=80&w=400', '7501080881235'),
('Detergente Multiusos 1kg', 'Limpieza', 2.80, 2, 4, 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&q=80&w=400', '7501090771234'); -- Alerta de stock bajo (2 <= 4)
