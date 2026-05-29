/* ====================================================================
   COMPONENTES DE INTERFAZ DE USUARIO (RENDERIZADO DINÁMICO)
   ==================================================================== */

/**
 * Muestra una notificación Toast elegante en pantalla.
 * @param {string} mensaje - Texto a mostrar.
 * @param {'success' | 'danger' | 'warning'} tipo - Tipo de alerta.
 */
export function showToast(mensaje, tipo = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    
    // Iconos de Lucide según el tipo
    let iconName = 'check-circle';
    if (tipo === 'danger') iconName = 'x-circle';
    if (tipo === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
        <span class="toast-icon"><i data-lucide="${iconName}"></i></span>
        <span class="toast-text">${mensaje}</span>
    `;

    // Limpiar notificaciones previas para evitar acumulaciones molestas e invasivas
    container.innerHTML = '';
    container.appendChild(toast);
    
    // Refrescar iconos de Lucide cargados
    if (window.lucide) {
        window.lucide.createIcons();
    }

    // Animación de entrada
    setTimeout(() => toast.classList.add('show'), 50);

    // Salida y destrucción
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Renderiza una tarjeta de producto en el catálogo de clientes.
 */
export function renderProductCard(producto, onAddToCart) {
    const isOutOfStock = producto.stock <= 0;
    const isLowStock = producto.stock > 0 && producto.stock <= producto.stock_minimo;
    
    // Imagen por defecto en caso de no proveer URL
    const imgUrl = producto.imagen_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400';

    const card = document.createElement('div');
    card.className = 'card product-card';
    card.setAttribute('data-id', producto.id);

    let badgeHTML = '';
    if (isOutOfStock) {
        badgeHTML = `<span class="stock-badge critico product-card-badge" style="background: rgba(255, 230, 230, 0.95); color: #800000; border: 1.5px solid #800000; font-weight: 800; font-size: 0.75rem;">Agotado</span>`;
    } else if (isLowStock) {
        badgeHTML = `<span class="stock-badge critico product-card-badge" style="background: rgba(255, 230, 230, 0.95); color: #800000; border: 1.5px solid #800000; font-weight: 800; font-size: 0.75rem;">Pocas Unidades</span>`;
    }

    const buttonStyle = isOutOfStock 
        ? 'background: transparent; border: 1px solid rgba(255, 255, 255, 0.15); color: var(--text-muted); opacity: 0.4; cursor: not-allowed; box-shadow: none; pointer-events: none;' 
        : '';

    card.innerHTML = `
        <div class="product-card-img-container">
            <img src="${imgUrl}" class="product-card-img" alt="${producto.nombre}" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400'">
            ${badgeHTML}
        </div>
        <div class="product-card-body">
            <span class="product-card-cat">${producto.categoria}</span>
            <h4 class="product-card-title">${producto.nombre}</h4>
            <div class="product-card-footer">
                <span class="product-card-price">$${Number(producto.precio).toFixed(2)}</span>
                <button class="btn btn-primary btn-sm add-to-cart-btn" ${isOutOfStock ? 'disabled' : ''} style="${buttonStyle}">
                    <i data-lucide="shopping-cart"></i>
                    <span>${isOutOfStock ? 'Sin Stock' : 'Agregar'}</span>
                </button>
            </div>
        </div>
    `;

    // Event Listener para añadir al carrito
    const btn = card.querySelector('.add-to-cart-btn');
    if (btn) {
        btn.addEventListener('click', () => onAddToCart(producto));
    }

    return card;
}

/**
 * Renderiza una fila de la tabla de inventario del Administrador.
 * Si el stock es <= stock_minimo, se agrega automáticamente la clase 'stock-critico' (resaltado en rojo).
 */
export function renderInventoryRow(producto, onEdit, onDelete) {
    const isCritical = producto.stock <= producto.stock_minimo;
    const tr = document.createElement('tr');
    
    // Resaltado estético en rojo suave
    if (isCritical) {
        tr.className = 'stock-critico';
    }

    const imgUrl = producto.imagen_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400';
    const stockBadgeClass = isCritical ? 'critico' : 'normal';
    const stockBadgeText = isCritical ? `⚠️ Stock Bajo: ${producto.stock}` : `✓ ${producto.stock}`;

    tr.innerHTML = `
        <td data-label="Producto">
            <div class="product-info-cell">
                <img src="${imgUrl}" class="product-img-thumb" alt="${producto.nombre}" onerror="this.src='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400'">
                <div style="display: flex; flex-direction: column; gap: 6px; align-items: flex-start; text-align: left;">
                    <strong style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary); line-height: 1.2;">${producto.nombre}</strong>
                    <span class="product-cat-tag" style="margin: 0; line-height: 1; display: inline-block;">${producto.categoria}</span>
                </div>
            </div>
        </td>
        <td data-label="Categoría">${producto.categoria}</td>
        <td data-label="Precio" style="font-weight: 600;">$${Number(producto.precio).toFixed(2)}</td>
        <td data-label="Stock Actual">
            <span class="stock-badge ${stockBadgeClass}">${stockBadgeText}</span>
        </td>
        <td data-label="Stock Mínimo" style="color: var(--text-secondary);">${producto.stock_minimo}</td>
        <td data-label="Código" style="font-family: monospace; color: var(--text-muted);">${producto.codigo_barras || 'N/A'}</td>
        <td data-label="Acciones" class="actions-cell" style="text-align: right;">
            <button class="btn btn-secondary btn-sm edit-btn" style="padding: 0.35rem 0.6rem;">
                <i data-lucide="edit-2"></i>
            </button>
            <button class="btn btn-danger btn-sm delete-btn" style="padding: 0.35rem 0.6rem;">
                <i data-lucide="trash-2"></i>
            </button>
        </td>
    `;

    // Event listeners
    tr.querySelector('.edit-btn').addEventListener('click', () => onEdit(producto));
    tr.querySelector('.delete-btn').addEventListener('click', () => onDelete(producto.id));

    return tr;
}

/**
 * Renderiza un item en la barra lateral del carrito.
 */
export function renderCartItem(item, onIncrease, onDecrease, onRemove) {
    const div = document.createElement('div');
    div.className = 'cart-item';

    div.innerHTML = `
        <div class="cart-item-info">
            <div class="cart-item-title">${item.nombre}</div>
            <div class="cart-item-price">$${Number(item.precio).toFixed(2)} c/u</div>
        </div>
        
        <div class="cart-item-qty">
            <button class="cart-item-btn dec-btn"><i data-lucide="minus"></i></button>
            <span style="font-weight: 700; min-width: 15px; text-align: center;">${item.cantidad}</span>
            <button class="cart-item-btn inc-btn"><i data-lucide="plus"></i></button>
        </div>
        
        <button class="cart-item-btn remove-btn" style="color: var(--color-danger); padding-left: 0.5rem;">
            <i data-lucide="trash"></i>
        </button>
    `;

    // Event listeners
    div.querySelector('.dec-btn').addEventListener('click', () => onDecrease(item.id));
    div.querySelector('.inc-btn').addEventListener('click', () => onIncrease(item.id));
    div.querySelector('.remove-btn').addEventListener('click', () => onRemove(item.id));

    return div;
}

/**
 * Renderiza una tarjeta resumen de pedido en el historial.
 */
export function renderOrderCard(pedido, isAdmin, onViewDetails, onCancelar, onCompletar, onEliminar) {
    const card = document.createElement('div');
    card.className = 'order-row-card';

    const fecha = new Date(pedido.creado_en).toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const clienteNombre = pedido.profiles ? pedido.profiles.nombre : 'Desconocido';
    const clienteEmail = pedido.profiles ? pedido.profiles.email : '';

    // ID del pedido recortado para ser estético
    const idCorto = pedido.id.substring(0, 8).toUpperCase();

    let metaHTML = `
        <div class="order-meta">
            <span class="order-id">Pedido #${idCorto}</span>
            <span class="order-date">${fecha}</span>
        </div>
    `;

    if (isAdmin) {
        metaHTML += `
            <div class="order-meta">
                <span style="font-size: 0.85rem; font-weight: 600;">Cliente: ${clienteNombre}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted);">${clienteEmail}</span>
            </div>
        `;
    }

    let actionsHTML = `
        <button class="btn btn-secondary btn-sm view-details-btn">
            <i data-lucide="eye" style="width: 14px; height: 14px; margin-right: 4px;"></i>
            <span>Ver Detalles</span>
        </button>
    `;

    if (pedido.estado === 'pendiente') {
        // Botón Cancelar (clientes y administradores)
        actionsHTML += `
            <button class="btn btn-sm cancel-btn" style="background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); color: #fca5a5; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <i data-lucide="x-circle" style="width: 14px; height: 14px;"></i>
                <span>Cancelar</span>
            </button>
        `;

        if (isAdmin) {
            // Botón Completar (solo administradores)
            actionsHTML += `
                <button class="btn btn-sm complete-btn" style="background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #a7f3d0; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                    <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>
                    <span>Completar</span>
                </button>
            `;
        }
    } else if (isAdmin && (pedido.estado === 'completado' || pedido.estado === 'cancelado')) {
        // Botón Eliminar Registro (solo administradores para pedidos finalizados)
        actionsHTML += `
            <button class="btn btn-sm delete-btn" style="background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5; margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                <span>Eliminar</span>
            </button>
        `;
    }

    card.innerHTML = `
        ${metaHTML}
        
        <div class="order-meta" style="text-align: right;">
            <span style="font-size: 1.15rem; font-weight: 700; color: white;">$${Number(pedido.total).toFixed(2)}</span>
            <span class="order-status ${pedido.estado}">${pedido.estado.toUpperCase()}</span>
        </div>
        
        <div class="order-actions" style="display: flex; align-items: center; gap: 0.25rem;">
            ${actionsHTML}
        </div>
    `;

    card.querySelector('.view-details-btn').addEventListener('click', () => onViewDetails(pedido));

    const cancelBtn = card.querySelector('.cancel-btn');
    if (cancelBtn && onCancelar) {
        cancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onCancelar(pedido.id);
        });
    }

    const completeBtn = card.querySelector('.complete-btn');
    if (completeBtn && onCompletar) {
        completeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onCompletar(pedido.id);
        });
    }

    const deleteBtn = card.querySelector('.delete-btn');
    if (deleteBtn && onEliminar) {
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onEliminar(pedido.id);
        });
    }

    return card;
}
