/* ====================================================================
   LÓGICA PRINCIPAL DE LA APLICACIÓN (SPA CONTROLLER)
   ==================================================================== */

import * as api from './supabase-api.js';
import * as ui from './components.js';

// Estado global de la aplicación (State Management)
const AppState = {
    user: null,         // Datos del usuario logueado en Supabase Auth
    profile: null,      // Perfil del usuario (rol, nombre) de public.profiles
    productos: [],      // Catálogo completo de productos cargado
    carrito: [],        // Elementos en el carrito de compras del cliente
    pedidos: [],        // Pedidos cargados de la base de datos
    currentView: 'catalog' // Vista actual en la SPA
};

// ====================================================================
// 1. INICIALIZACIÓN Y ENRUTADOR DE LA SPA
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar sesión de forma asíncrona inmediata en Supabase Auth
    // Si no hay usuario autenticado activo, redirigir de inmediato a login.html
    const user = await api.getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Si hay sesión activa, inicializar escuchas del DOM
    setupEventListeners();

    // 3. Cargar productos inicialmente (Lectura segura tras autenticación)
    await cargarProductos();

    // 4. Renderizar catálogo inicial en pantalla
    renderCatalogo();

    // 5. Escuchar cambios futuros de estado en la autenticación de Supabase
    api.supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Cambio de estado Auth en la SPA:", event);
        if (session && session.user) {
            AppState.user = session.user;
            
            // Cargar el perfil para determinar el rol
            const { profile, error } = await api.getUserProfile(session.user.id);
            if (!error && profile) {
                AppState.profile = profile;
                
                // Forzar el rol de administrador para el correo específico indicado por el usuario
                if (session.user.email === 'bjacnier28giler@gmail.com' && profile.rol !== 'admin') {
                    // Actualizar en base de datos para persistirlo
                    await api.updateProducto(profile.id, { rol: 'admin' });
                    AppState.profile.rol = 'admin';
                }
            } else {
                // Fallback de seguridad para asignar rol
                AppState.profile = {
                    rol: session.user.email === 'bjacnier28giler@gmail.com' ? 'admin' : 'cliente',
                    nombre: session.user.user_metadata?.nombre || 'Usuario'
                };
            }
            
            ui.showToast(`¡Bienvenido de nuevo, ${AppState.profile.nombre}!`, 'success');
            
            // Renderizar barra de navegación dinámica y cambiar vistas correspondientes
            renderNavbar();
            if (AppState.profile?.rol === 'admin') {
                switchView('admin');
            } else {
                switchView('catalog');
            }
        } else {
            // Si el usuario cierra sesión, limpiar estado y redirigir obligatoriamente a login.html
            AppState.user = null;
            AppState.profile = null;
            AppState.carrito = [];
            AppState.pedidos = [];
            actualizarContadorCarrito();
            window.location.href = 'login.html';
        }
    });
    
    // Inicializar iconos Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

/**
 * Registra los escuchas de eventos (listeners) generales para formularios y modales.
 */
function setupEventListeners() {
    // Redirección de la marca del Logo
    document.getElementById('nav-brand').addEventListener('click', () => {
        if (AppState.profile?.rol === 'admin') {
            switchView('admin');
        } else {
            switchView('catalog');
        }
    });

    // La autenticación ahora se gestiona de forma externa en login.html y registro.html

    // Controles de búsqueda y filtros del catálogo de clientes
    document.getElementById('catalog-search').addEventListener('input', filtrarCatalogo);
    document.getElementById('catalog-category-filter').addEventListener('change', filtrarCatalogo);

    // Botón de checkout del carrito
    document.getElementById('cart-checkout-btn').addEventListener('click', procesarCompra);

    // Controles de búsqueda y filtros de la tabla de inventario del administrador
    document.getElementById('admin-search').addEventListener('input', filtrarInventario);
    document.getElementById('admin-category-filter').addEventListener('change', filtrarInventario);
    document.getElementById('admin-stock-filter').addEventListener('change', filtrarInventario);

    // Botón de Nuevo Producto
    document.getElementById('admin-add-product-btn').addEventListener('click', () => openProductModal());

    // Cierre del modal de productos
    document.getElementById('modal-product-close').addEventListener('click', closeProductModal);
    document.getElementById('modal-product-cancel').addEventListener('click', closeProductModal);
    
    // Formulario de Producto (Guardar / Editar)
    const formProduct = document.getElementById('form-product');
    formProduct.addEventListener('submit', handleProductSubmit);

    // Configuración del Selector Híbrido de Categorías (Chips de Selección)
    const categoryChips = document.querySelectorAll('.category-chip');
    const inputCategory = document.getElementById('prod-category');
    
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Deseleccionar anteriores
            categoryChips.forEach(c => c.classList.remove('active'));
            
            // Activar actual
            chip.classList.add('active');
            
            // Copiar el valor seleccionado al input de texto libre
            inputCategory.value = chip.getAttribute('data-cat');
        });
    });

    // Si el usuario escribe manualmente, deseleccionamos los chips
    inputCategory.addEventListener('input', () => {
        categoryChips.forEach(chip => {
            if (chip.getAttribute('data-cat').toLowerCase() === inputCategory.value.trim().toLowerCase()) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    });

    // Cierre de modal de detalles de pedido
    document.getElementById('modal-order-details-close').addEventListener('click', () => {
        document.getElementById('modal-order-details').classList.remove('active');
    });

    // Filtro de Historial de Pedidos
    document.getElementById('order-status-filter').addEventListener('change', filtrarPedidos);
}

/**
 * Administra el enrutamiento (Routing) dinámico de la SPA ocultando y mostrando secciones.
 */
function switchView(viewId) {
    // 1. Protección de rutas seguras
    if (viewId === 'admin' && AppState.profile?.rol !== 'admin') {
        ui.showToast('Acceso no autorizado al panel administrativo', 'danger');
        switchView('catalog');
        return;
    }
    
    if (viewId === 'orders' && !AppState.user) {
        ui.showToast('Inicia sesión para ver tu historial de pedidos', 'warning');
        window.location.href = 'login.html';
        return;
    }

    // 2. Cambiar clases activas en las secciones HTML
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        if (view.id === `view-${viewId}`) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    // 3. Cambiar clases activas en los enlaces de navegación
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('data-view') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    AppState.currentView = viewId;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 4. Cargar datos específicos de la vista al entrar
    if (viewId === 'catalog') {
        renderCatalogo();
    } else if (viewId === 'admin') {
        cargarEstadisticasAdmin();
        renderInventario();
    } else if (viewId === 'orders') {
        cargarPedidos();
    }

    // Refrescar iconos Lucide cargados
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Renderiza dinámicamente la barra de navegación basada en la sesión y el rol.
 */
function renderNavbar() {
    const navMenu = document.getElementById('nav-menu');
    const userMenu = document.getElementById('user-menu');

    // 1. Poblar Enlaces de Navegación según Rol
    let menuHTML = `<a class="nav-link active" data-view="catalog">Catálogo</a>`;
    
    if (AppState.user) {
        if (AppState.profile?.rol === 'admin') {
            menuHTML = `
                <a class="nav-link" data-view="admin">Dashboard Inventario</a>
                <a class="nav-link" data-view="orders">Gestión de Pedidos</a>
                <a class="nav-link" data-view="catalog">Ver Catálogo</a>
            `;
        } else {
            menuHTML += `
                <a class="nav-link" data-view="orders">Mis Pedidos</a>
            `;
        }
    }
    navMenu.innerHTML = menuHTML;

    // Configurar listeners de la navegación recién creada
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(link.getAttribute('data-view'));
        });
    });

    // 2. Poblar Menú de Usuario (Perfil / Login / Logout)
    if (AppState.user) {
        const isAdmin = AppState.profile?.rol === 'admin';
        const badgeClass = isAdmin ? 'user-badge admin-badge' : 'user-badge';
        const badgeIcon = isAdmin ? 'shield' : 'user';
        const badgeText = isAdmin ? 'Administrador' : 'Cliente';

        userMenu.innerHTML = `
            <div class="${badgeClass}">
                <i data-lucide="${badgeIcon}" style="width: 14px; height: 14px;"></i>
                <span>${AppState.profile?.nombre || 'Usuario'}</span>
            </div>
            <button id="logout-btn" class="btn btn-secondary btn-sm">
                <i data-lucide="log-out"></i>
                <span>Salir</span>
            </button>
        `;

        document.getElementById('logout-btn').addEventListener('click', async () => {
            const { error } = await api.signOut();
            if (!error) {
                ui.showToast('Sesión cerrada correctamente', 'success');
            }
        });
    } else {
        userMenu.innerHTML = `
            <button id="nav-login-btn" class="btn btn-primary btn-sm">
                <i data-lucide="log-in"></i>
                <span>Ingresar / Registro</span>
            </button>
        `;

        document.getElementById('nav-login-btn').addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}


// ====================================================================
// 2. LÓGICA DE AUTENTICACIÓN (LOGIN / REGISTRO TRASLADADOS)
// ====================================================================
// La lógica de login y registro se maneja de forma independiente en sus
// respectivos controladores: js/login.js y js/registro.js para un diseño más despejado


// ====================================================================
// 3. LÓGICA DEL CATÁLOGO DE PRODUCTOS (CLIENTE)
// ====================================================================

async function cargarProductos() {
    const { productos, error } = await api.getProductos();
    if (!error) {
        AppState.productos = productos;
    } else {
        ui.showToast('Error al conectar con la base de datos de productos', 'danger');
    }
}

function renderCatalogo() {
    const catalogGrid = document.getElementById('catalog-grid');
    catalogGrid.innerHTML = '';

    const query = document.getElementById('catalog-search').value.toLowerCase().trim();
    const category = document.getElementById('catalog-category-filter').value;

    const productosFiltrados = AppState.productos.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(query) || (prod.codigo_barras && prod.codigo_barras.includes(query));
        const coincideCategoria = !category || prod.categoria === category;
        return coincideNombre && coincideCategoria;
    });

    if (productosFiltrados.length === 0) {
        catalogGrid.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="shopping-bag" style="width: 48px; height: 48px; margin: 0 auto 1rem auto; opacity: 0.5;"></i>
                <p>No se encontraron productos disponibles con los criterios de búsqueda.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    productosFiltrados.forEach(prod => {
        const card = ui.renderProductCard(prod, agregarAlCarrito);
        catalogGrid.appendChild(card);
    });
}

function filtrarCatalogo() {
    renderCatalogo();
}


// ====================================================================
// 4. LÓGICA DEL CARRITO DE COMPRAS
// ====================================================================

function agregarAlCarrito(producto) {
    if (!AppState.user) {
        ui.showToast('Debes iniciar sesión para realizar pedidos', 'warning');
        window.location.href = 'login.html';
        return;
    }

    // Buscar si ya está en el carrito
    const itemEnCarrito = AppState.carrito.find(item => item.id === producto.id);
    
    // Verificar stock límite
    const cantidadActual = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    if (cantidadActual + 1 > producto.stock) {
        ui.showToast(`Lo sentimos, solo quedan ${producto.stock} unidades de este producto`, 'warning');
        return;
    }

    if (itemEnCarrito) {
        itemEnCarrito.cantidad += 1;
    } else {
        AppState.carrito.push({
            id: producto.id,
            nombre: producto.nombre,
            precio: Number(producto.precio),
            cantidad: 1
        });
    }

    ui.showToast(`"${producto.nombre}" agregado al carrito`, 'success');
    renderCarrito();
}

function incrementarItemCarrito(id) {
    const item = AppState.carrito.find(item => item.id === id);
    const prodOriginal = AppState.productos.find(p => p.id === id);

    if (item && prodOriginal) {
        if (item.cantidad + 1 > prodOriginal.stock) {
            ui.showToast(`Límite de stock alcanzado (${prodOriginal.stock} unidades)`, 'warning');
            return;
        }
        item.cantidad += 1;
        renderCarrito();
    }
}

function decrementarItemCarrito(id) {
    const item = AppState.carrito.find(item => item.id === id);
    if (item) {
        item.cantidad -= 1;
        if (item.cantidad <= 0) {
            removerItemCarrito(id);
        } else {
            renderCarrito();
        }
    }
}

function removerItemCarrito(id) {
    AppState.carrito = AppState.carrito.filter(item => item.id !== id);
    ui.showToast('Producto removido del carrito', 'warning');
    renderCarrito();
}

function renderCarrito() {
    const cartItemsContainer = document.getElementById('cart-items');
    cartItemsContainer.innerHTML = '';

    if (AppState.carrito.length === 0) {
        cartItemsContainer.innerHTML = `<p class="cart-empty-text">El carrito está vacío</p>`;
        actualizarContadorCarrito();
        return;
    }

    AppState.carrito.forEach(item => {
        const itemEl = ui.renderCartItem(item, incrementarItemCarrito, decrementarItemCarrito, removerItemCarrito);
        cartItemsContainer.appendChild(itemEl);
    });

    actualizarContadorCarrito();
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function actualizarContadorCarrito() {
    const countLabel = document.getElementById('cart-count-label');
    const totalLabel = document.getElementById('cart-total-label');
    const checkoutBtn = document.getElementById('cart-checkout-btn');

    const totalProductos = AppState.carrito.reduce((sum, item) => sum + item.cantidad, 0);
    const totalDinero = AppState.carrito.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

    countLabel.textContent = totalProductos;
    totalLabel.textContent = `$${totalDinero.toFixed(2)}`;

    checkoutBtn.disabled = AppState.carrito.length === 0;
}

async function procesarCompra() {
    if (AppState.carrito.length === 0) return;
    
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.querySelector('span').textContent = "Confirmando...";

    const totalDinero = AppState.carrito.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

    const { pedido, error } = await api.crearPedido(AppState.user.id, totalDinero, AppState.carrito);

    if (error) {
        ui.showToast(`Error al procesar la compra: ${error}`, 'danger');
        checkoutBtn.disabled = false;
        checkoutBtn.querySelector('span').textContent = "Confirmar Pedido";
    } else {
        ui.showToast('¡Pedido realizado con éxito! Su stock ha sido actualizado.', 'success');
        AppState.carrito = [];
        renderCarrito();
        
        // Recargar productos para refrescar stock en la pantalla
        await cargarProductos();
        renderCatalogo();
        
        // Redirigir a sus pedidos
        switchView('orders');
    }
    
    if (window.lucide) window.lucide.createIcons();
}


// ====================================================================
// 5. PANEL DE ADMINISTRADOR (CONTROL DE INVENTARIO Y ALERTAS EN ROJO)
// ====================================================================

function cargarEstadisticasAdmin() {
    const totalProductsEl = document.getElementById('stat-total-products');
    const valueEl = document.getElementById('stat-inventory-value');
    const criticalEl = document.getElementById('stat-critical-products');
    const alertCard = document.getElementById('stat-alert-card');

    const total = AppState.productos.length;
    const valorInventario = AppState.productos.reduce((sum, p) => sum + (p.stock * Number(p.precio)), 0);
    
    // Cuenta los productos en ALERTA CRÍTICA (stock <= stock_minimo)
    const criticos = AppState.productos.filter(p => p.stock <= p.stock_minimo).length;

    totalProductsEl.textContent = total;
    valueEl.textContent = `$${valorInventario.toFixed(2)}`;
    criticalEl.textContent = criticos;

    // Resaltado extra de la tarjeta de alerta en caso de stock crítico presente
    if (criticos > 0) {
        alertCard.style.borderColor = 'var(--color-danger)';
        alertCard.style.background = 'rgba(239, 68, 68, 0.05)';
        alertCard.style.boxShadow = 'var(--shadow-danger-glow)';
    } else {
        alertCard.style.borderColor = 'var(--border-color)';
        alertCard.style.background = 'var(--bg-card)';
        alertCard.style.boxShadow = 'none';
    }
}

function renderInventario() {
    const tableBody = document.getElementById('admin-inventory-table-body');
    tableBody.innerHTML = '';

    const query = document.getElementById('admin-search').value.toLowerCase().trim();
    const category = document.getElementById('admin-category-filter').value;
    const stockFilter = document.getElementById('admin-stock-filter').value;

    const productosFiltrados = AppState.productos.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(query) || (prod.codigo_barras && prod.codigo_barras.includes(query));
        const coincideCategoria = !category || prod.categoria === category;
        
        let coincideStock = true;
        if (stockFilter === 'critico') {
            coincideStock = prod.stock <= prod.stock_minimo;
        } else if (stockFilter === 'suficiente') {
            coincideStock = prod.stock > prod.stock_minimo;
        }

        return coincideNombre && coincideCategoria && coincideStock;
    });

    if (productosFiltrados.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i data-lucide="package-search" style="width: 40px; height: 40px; margin: 0 auto 0.75rem auto; opacity: 0.5; display: block;"></i>
                    No se encontraron productos registrados con los filtros aplicados.
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    productosFiltrados.forEach(prod => {
        // Genera la fila. RenderInventoryRow aplica automáticamente la clase "stock-critico" (fondo rojo suave) si cumple la condición
        const tr = ui.renderInventoryRow(prod, openProductModal, eliminarProducto);
        tableBody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function filtrarInventario() {
    renderInventario();
}

// --- CRUD DE PRODUCTOS (MODAL ADMINISTRACIÓN) ---

function openProductModal(producto = null) {
    const modal = document.getElementById('modal-product');
    const title = document.getElementById('modal-product-title');
    const form = document.getElementById('form-product');
    const chips = document.querySelectorAll('.category-chip');
    
    form.reset();
    chips.forEach(c => c.classList.remove('active'));

    if (producto) {
        title.textContent = "Editar Producto";
        document.getElementById('prod-id').value = producto.id;
        document.getElementById('prod-name').value = producto.nombre;
        document.getElementById('prod-category').value = producto.categoria;
        document.getElementById('prod-price').value = producto.precio;
        document.getElementById('prod-barcode').value = producto.codigo_barras || '';
        document.getElementById('prod-stock').value = producto.stock;
        document.getElementById('prod-min-stock').value = producto.stock_minimo;
        document.getElementById('prod-image').value = producto.imagen_url || '';

        // Activar chip si coincide
        chips.forEach(chip => {
            if (chip.getAttribute('data-cat') === producto.categoria) {
                chip.classList.add('active');
            }
        });
    } else {
        title.textContent = "Nuevo Producto";
        document.getElementById('prod-id').value = "";
    }

    modal.classList.add('active');
    
    if (window.lucide) window.lucide.createIcons();
}

function closeProductModal() {
    document.getElementById('modal-product').classList.remove('active');
}

async function handleProductSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('prod-id').value;
    const productoData = {
        nombre: document.getElementById('prod-name').value.trim(),
        categoria: document.getElementById('prod-category').value.trim(),
        precio: parseFloat(document.getElementById('prod-price').value),
        codigo_barras: document.getElementById('prod-barcode').value.trim() || null,
        stock: parseInt(document.getElementById('prod-stock').value),
        stock_minimo: parseInt(document.getElementById('prod-min-stock').value),
        imagen_url: document.getElementById('prod-image').value.trim() || null
    };

    if (!productoData.nombre || !productoData.categoria || isNaN(productoData.precio) || isNaN(productoData.stock)) {
        ui.showToast('Por favor, completa los campos requeridos', 'warning');
        return;
    }

    const saveBtn = document.getElementById('modal-product-submit');
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";

    let result;
    if (id) {
        // Actualización
        result = await api.updateProducto(id, productoData);
    } else {
        // Inserción
        result = await api.addProducto(productoData);
    }

    if (result.error) {
        ui.showToast(`Error al guardar el producto: ${result.error}`, 'danger');
    } else {
        ui.showToast(`Producto "${productoData.nombre}" guardado con éxito`, 'success');
        closeProductModal();
        
        // Recargar inventario
        await cargarProductos();
        cargarEstadisticasAdmin();
        renderInventario();
    }

    saveBtn.disabled = false;
    saveBtn.textContent = id ? "Guardar Cambios" : "Guardar Producto";
}

async function eliminarProducto(id) {
    const prod = AppState.productos.find(p => p.id === id);
    if (!prod) return;

    if (confirm(`¿Estás seguro de que deseas eliminar el producto "${prod.nombre}" del inventario?`)) {
        const { error } = await api.deleteProducto(id);
        if (error) {
            ui.showToast(`Error al eliminar: ${error}`, 'danger');
        } else {
            ui.showToast('Producto eliminado exitosamente', 'success');
            await cargarProductos();
            cargarEstadisticasAdmin();
            renderInventario();
        }
    }
}


// ====================================================================
// 6. LÓGICA DE HISTORIAL Y DETALLES DE PEDIDOS
// ====================================================================

async function cargarPedidos() {
    const isAdmin = AppState.profile?.rol === 'admin';
    const { pedidos, error } = await api.getPedidos(isAdmin, AppState.user.id);
    
    if (!error) {
        AppState.pedidos = pedidos;
        
        // Ajustar títulos dinámicamente según rol
        const titleEl = document.getElementById('orders-view-title');
        const subtitleEl = document.getElementById('orders-view-subtitle');

        if (isAdmin) {
            titleEl.textContent = "Gestión de Pedidos de Clientes";
            subtitleEl.textContent = "Verifica y actualiza el estado de las órdenes en la tienda";
        } else {
            titleEl.textContent = "Historial de Pedidos";
            subtitleEl.textContent = "Consulta tus compras realizadas y estados de entrega";
        }

        renderPedidos();
    } else {
        ui.showToast('Error al cargar pedidos', 'danger');
    }
}

function renderPedidos() {
    const ordersList = document.getElementById('orders-list');
    ordersList.innerHTML = '';

    const filterStatus = document.getElementById('order-status-filter').value;

    const pedidosFiltrados = AppState.pedidos.filter(ped => {
        return filterStatus === 'todos' || ped.estado === filterStatus;
    });

    if (pedidosFiltrados.length === 0) {
        ordersList.innerHTML = `
            <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="receipt" style="width: 48px; height: 48px; margin: 0 auto 1rem auto; opacity: 0.5;"></i>
                <p>No se encontraron registros de pedidos en este estado.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const isAdmin = AppState.profile?.rol === 'admin';

    pedidosFiltrados.forEach(pedido => {
        const orderCard = ui.renderOrderCard(pedido, isAdmin, abrirDetallesPedido);
        ordersList.appendChild(orderCard);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function filtrarPedidos() {
    renderPedidos();
}

/**
 * Abre el modal detallado de un pedido cargando sus productos desde Supabase.
 */
async function abrirDetallesPedido(pedido) {
    const modal = document.getElementById('modal-order-details');
    
    // Setear datos de cabecera
    const idCorto = pedido.id.substring(0, 8).toUpperCase();
    document.getElementById('det-order-id').textContent = `#${idCorto}`;
    
    const fecha = new Date(pedido.creado_en).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('det-order-date').textContent = fecha;
    
    const clienteNombre = pedido.profiles ? pedido.profiles.nombre : 'Desconocido';
    document.getElementById('det-order-client').textContent = clienteNombre;
    
    const statusBadge = document.getElementById('det-order-status');
    statusBadge.className = `order-status ${pedido.estado}`;
    statusBadge.textContent = pedido.estado.toUpperCase();
    
    document.getElementById('det-order-total').textContent = `$${Number(pedido.total).toFixed(2)}`;

    // Cargar detalles de productos del pedido desde la API
    const itemsBody = document.getElementById('det-order-items-body');
    itemsBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando productos...</td></tr>';
    
    modal.classList.add('active');

    const { detalles, error } = await api.getDetallesPedido(pedido.id);
    
    if (error || !detalles) {
        itemsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-danger);">Fallo al cargar ítems.</td></tr>';
        return;
    }

    itemsBody.innerHTML = '';
    detalles.forEach(det => {
        const prod = det.productos || { nombre: 'Producto Eliminado', categoria: 'N/A' };
        const subtotal = det.cantidad * Number(det.precio_unitario);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${prod.nombre}</strong><br>
                <span class="product-cat-tag" style="margin-top: 0.15rem; display: inline-block;">${prod.categoria}</span>
            </td>
            <td style="text-align: center; font-weight: 600;">${det.cantidad}</td>
            <td style="text-align: right;">$${Number(det.precio_unitario).toFixed(2)}</td>
            <td style="text-align: right; font-weight: 700; color: white;">$${subtotal.toFixed(2)}</td>
        `;
        itemsBody.appendChild(tr);
    });

    // Configurar footer del modal (Acciones especiales para el Admin)
    const footer = document.getElementById('det-order-footer');
    footer.innerHTML = '';

    const isAdmin = AppState.profile?.rol === 'admin';
    
    if (isAdmin && pedido.estado === 'pendiente') {
        footer.innerHTML = `
            <button class="btn btn-danger btn-sm cancel-order-btn">Cancelar Pedido</button>
            <button class="btn btn-primary btn-sm complete-order-btn">Completar Pedido</button>
        `;

        footer.querySelector('.cancel-order-btn').addEventListener('click', () => cambiarEstado(pedido.id, 'cancelado'));
        footer.querySelector('.complete-order-btn').addEventListener('click', () => cambiarEstado(pedido.id, 'completated')); // Standard database check has completed, wait it's "completado" in setup.sql, let's use 'completado'
    } else {
        footer.innerHTML = `<button class="btn btn-secondary btn-sm close-modal-btn">Cerrar</button>`;
        footer.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    }

    async function cambiarEstado(id, nuevoEstado) {
        // En setup.sql, el check tiene ('pendiente', 'completado', 'cancelado').
        // Mapear 'completated' a 'completado'
        const estadoDb = nuevoEstado === 'completated' ? 'completado' : nuevoEstado;
        
        const { data, error: errUpdate } = await api.updateEstadoPedido(id, estadoDb);
        
        if (errUpdate) {
            ui.showToast(`Error al actualizar estado: ${errUpdate}`, 'danger');
        } else {
            ui.showToast(`Pedido actualizado a ${estadoDb.toUpperCase()} con éxito.`, 'success');
            modal.classList.remove('active');
            
            // Recargar pedidos e inventario
            await cargarPedidos();
            await cargarProductos();
            cargarEstadisticasAdmin();
            renderInventario();
        }
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}
