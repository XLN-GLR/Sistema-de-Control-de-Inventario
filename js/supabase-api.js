/* ====================================================================
   MÓDULO DE SERVICIOS API - INTEGRACIÓN CON SUPABASE
   ==================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Inicialización del cliente Supabase
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * ====================================================================
 * SECCIÓN 1: SERVICIOS DE AUTENTICACIÓN (AUTH)
 * ====================================================================
 */

/**
 * Registra un nuevo usuario en la base de datos.
 * El trigger de PostgreSQL creará automáticamente un registro en public.profiles.
 */
export async function signUp(email, password, nombre) {
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nombre: nombre
                }
            }
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error("Error en signUp:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Inicia sesión de un usuario registrado.
 */
export async function signIn(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error("Error en signIn:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Cierra la sesión del usuario actual.
 */
export async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error("Error en signOut:", error.message);
        return { error: error.message };
    }
}

/**
 * Obtiene el usuario autenticado actualmente en la sesión.
 */
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Obtiene el perfil de un usuario específico desde la tabla public.profiles.
 * Esto determina si es 'admin' o 'cliente'.
 */
export async function getUserProfile(userId) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return { profile: data, error: null };
    } catch (error) {
        console.error("Error en getUserProfile:", error.message);
        return { profile: null, error: error.message };
    }
}

/**
 * Actualiza los campos de un perfil de usuario (ej. rol) en public.profiles.
 */
export async function updateProfile(userId, campos) {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .update(campos)
            .eq('id', userId)
            .select();

        if (error) throw error;
        return { data: data[0], error: null };
    } catch (error) {
        console.error("Error en updateProfile:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Crea un perfil de usuario en la tabla public.profiles.
 */
export async function createProfile(userId, email, nombre, rol = 'cliente') {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .insert([{ id: userId, email, nombre, rol }])
            .select();

        if (error) throw error;
        return { profile: data[0], error: null };
    } catch (error) {
        console.error("Error en createProfile:", error.message);
        return { profile: null, error: error.message };
    }
}
/**
 * ====================================================================
 * SECCIÓN 2: SERVICIOS DE INVENTARIO (CRUD PRODUCTOS)
 * ====================================================================
 */

/**
 * Obtiene todos los productos de la tienda en tiempo real.
 */
export async function getProductos() {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .order('nombre', { ascending: true });

        if (error) throw error;
        return { productos: data, error: null };
    } catch (error) {
        console.error("Error en getProductos:", error.message);
        return { productos: [], error: error.message };
    }
}

/**
 * Obtiene un producto en específico por su ID.
 */
export async function getProductoById(id) {
    try {
        const { data, error } = await supabase
            .from('productos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return { producto: data, error: null };
    } catch (error) {
        console.error("Error en getProductoById:", error.message);
        return { producto: null, error: error.message };
    }
}

/**
 * Agrega un nuevo producto a la base de datos (Solo Admin).
 */
export async function addProducto(producto) {
    try {
        const { data, error } = await supabase
            .from('productos')
            .insert([producto])
            .select();

        if (error) throw error;
        return { data: data[0], error: null };
    } catch (error) {
        console.error("Error en addProducto:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Edita un producto existente en el inventario.
 * Se puede usar para actualizar stock, precios o datos del artículo.
 */
export async function updateProducto(id, campos) {
    try {
        const { data, error } = await supabase
            .from('productos')
            .update(campos)
            .eq('id', id)
            .select();

        if (error) throw error;
        return { data: data[0], error: null };
    } catch (error) {
        console.error("Error en updateProducto:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Elimina un producto del inventario (Solo Admin).
 */
export async function deleteProducto(id) {
    try {
        const { data, error } = await supabase
            .from('productos')
            .delete()
            .eq('id', id)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error("No se pudo eliminar el producto en el servidor. Verifica tus permisos RLS de Administrador.");
        }
        return { error: null };
    } catch (error) {
        console.error("Error en deleteProducto:", error.message);
        return { error: error.message };
    }
}


/**
 * ====================================================================
 * SECCIÓN 3: GESTIÓN DE COMPRAS Y PEDIDOS
 * ====================================================================
 */

/**
 * Registra una nueva compra en el sistema.
 * Crea el pedido, inserta los detalles del pedido y reduce el stock de los productos.
 */
export async function crearPedido(clienteId, total, items) {
    try {
        // Step 1: Insertar el registro del pedido en 'pedidos'
        const { data: pedido, error: errPedido } = await supabase
            .from('pedidos')
            .insert([{
                cliente_id: clienteId,
                total: total,
                estado: 'pendiente'
            }])
            .select()
            .single();

        if (errPedido) throw errPedido;

        // Step 2: Construir e insertar los detalles del pedido en 'detalles_pedido'
        const detalles = items.map(item => ({
            pedido_id: pedido.id,
            producto_id: item.id,
            cantidad: item.cantidad,
            precio_unitario: item.precio
        }));

        const { error: errDetalles } = await supabase
            .from('detalles_pedido')
            .insert(detalles);

        if (errDetalles) throw errDetalles;

        // Step 3: Descontar stock de los productos de forma individual (De forma no bloqueante por si RLS restringe update a clientes)
        try {
            for (const item of items) {
                const { producto, error: errStock } = await getProductoById(item.id);
                if (!errStock && producto) {
                    const nuevoStock = Math.max(0, producto.stock - item.cantidad);
                    await supabase
                        .from('productos')
                        .update({ stock: nuevoStock })
                        .eq('id', item.id);
                }
            }
        } catch (stockErr) {
            console.warn("No se pudo actualizar el stock automáticamente por RLS o red:", stockErr);
        }

        return { pedido, error: null };
    } catch (error) {
        console.error("Error crítico en crearPedido:", error);
        // Garantizar el retorno de un mensaje de error legible tipo string
        const errMsg = error.message || error.details || (typeof error === 'string' ? error : 'Error desconocido de base de datos');
        return { pedido: null, error: errMsg };
    }
}

/**
 * Obtiene la lista de pedidos de la base de datos.
 * Si el usuario es administrador, lee todos. Si es cliente, lee solo los suyos.
 */
export async function getPedidos(isAdmin, userId = null) {
    try {
        let query = supabase
            .from('pedidos')
            .select(`
                *,
                profiles (
                    nombre,
                    email
                )
            `)
            .order('creado_en', { ascending: false });

        if (!isAdmin && userId) {
            query = query.eq('cliente_id', userId);
        }

        const { data, error } = await query;
        if (error) throw error;
        return { pedidos: data, error: null };
    } catch (error) {
        console.error("Error en getPedidos:", error.message);
        return { pedidos: [], error: error.message };
    }
}

/**
 * Obtiene los detalles específicos (productos, cantidades, precios) de un pedido.
 */
export async function getDetallesPedido(pedidoId) {
    try {
        const { data, error } = await supabase
            .from('detalles_pedido')
            .select(`
                *,
                productos (
                    nombre,
                    categoria,
                    imagen_url
                )
            `)
            .eq('pedido_id', pedidoId);

        if (error) throw error;
        return { detalles: data, error: null };
    } catch (error) {
        console.error("Error en getDetallesPedido:", error.message);
        return { detalles: [], error: error.message };
    }
}

/**
 * Actualiza el estado de un pedido (ej. de 'pendiente' a 'completado' o 'cancelado') (Solo Admin).
 * Si se cancela, se puede implementar la devolución del stock (opcional y de gran valor).
 */
export async function updateEstadoPedido(pedidoId, nuevoEstado) {
    try {
        // 1. Intentar actualizar el estado del pedido primero en Supabase
        const { data, error } = await supabase
            .from('pedidos')
            .update({ estado: nuevoEstado })
            .eq('id', pedidoId)
            .select();

        if (error) throw error;

        // 2. Si se canceló correctamente en la DB, proceder a devolver el stock de los productos comprados
        if (nuevoEstado === 'cancelado') {
            const { detalles, error: errDetalles } = await getDetallesPedido(pedidoId);
            if (!errDetalles && detalles) {
                for (const det of detalles) {
                    const { producto, error: errProd } = await getProductoById(det.producto_id);
                    if (!errProd && producto) {
                        const nuevoStock = producto.stock + det.cantidad;
                        await supabase
                            .from('productos')
                            .update({ stock: nuevoStock })
                            .eq('id', det.producto_id);
                    }
                }
            }
        }

        return { data: data[0], error: null };
    } catch (error) {
        console.error("Error en updateEstadoPedido:", error.message);
        return { data: null, error: error.message };
    }
}

/**
 * Elimina permanentemente un pedido y sus detalles asociados de la base de datos (Solo Admin).
 */
export async function deletePedido(pedidoId) {
    try {
        // Primero eliminar de forma explícita los detalles del pedido asociados
        const { error: errDetalles } = await supabase
            .from('detalles_pedido')
            .delete()
            .eq('pedido_id', pedidoId);

        if (errDetalles) throw errDetalles;

        // Luego eliminar el pedido principal
        const { data, error } = await supabase
            .from('pedidos')
            .delete()
            .eq('id', pedidoId)
            .select();

        if (error) throw error;
        if (!data || data.length === 0) {
            throw new Error("No se pudo eliminar el pedido en el servidor. Verifica tus permisos RLS de Administrador.");
        }
        return { error: null };
    } catch (error) {
        console.error("Error en deletePedido:", error.message);
        return { error: error.message };
    }
}
