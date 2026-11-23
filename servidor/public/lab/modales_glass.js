/**
 * PRETO LEONE - GESTOR MODULAR DE MODALES GLASSMORHPISM
 * Maneja ventanas modales (Agendar & FAQ) sin salto de scroll.
 */
(function(window, document) {
    'use strict';

    const PretoModales = {
        activeModal: null,
        triggerEl: null,
        focusTimer: null,

        esTactil: function() {
            return window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
        },

        init: function() {
            this.bindTriggers();
            this.bindCloseButtons();
            this.bindKeyboard();
            this.bindTouchScrollLock();
            this.bindFormCotizar();
        },

        bindTriggers: function() {
            document.addEventListener('click', (e) => {
                const target = e.target.closest('a[href="#agendar"], a[href="#faq"], [data-open-modal]');
                if (!target) return;

                let modalId = target.getAttribute('data-open-modal');
                if (!modalId) {
                    const href = target.getAttribute('href');
                    if (href === '#agendar') modalId = 'modal-agendar';
                    if (href === '#faq') modalId = 'modal-faq';
                }

                if (modalId) {
                    // Detener completamente el salto de scroll por ancla
                    e.preventDefault();
                    e.stopPropagation();
                    this.open(modalId, target);
                }
            });
        },

        bindCloseButtons: function() {
            document.addEventListener('click', (e) => {
                // Clic en botón cerrar
                const closeBtn = e.target.closest('.glass-modal-close, [data-close-modal]');
                if (closeBtn) {
                    e.preventDefault();
                    this.close();
                    return;
                }

                // Clic fuera del diálogo (en el fondo oscuro de cristal)
                if (e.target.classList.contains('glass-modal-overlay') && e.target.classList.contains('is-active')) {
                    e.preventDefault();
                    this.close();
                }
            });
        },

        bindKeyboard: function() {
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.activeModal) {
                    this.close();
                }
            });
        },

        bindTouchScrollLock: function() {
            document.addEventListener('touchmove', (e) => {
                if (!this.activeModal) return;
                const dialog = e.target.closest('.glass-modal-dialog');
                if (!dialog || !this.activeModal.contains(dialog) || dialog.scrollHeight <= dialog.clientHeight) {
                    if (e.cancelable) e.preventDefault();
                }
            }, { passive: false });
        },

        open: function(modalId, triggerEl) {
            const modalEl = document.getElementById(modalId);
            if (!modalEl) {
                console.warn('[PretoModales] Modal no encontrado:', modalId);
                return;
            }

            if (this.activeModal === modalEl) {
                return;
            }

            if (typeof window.PretoCerrarVisor === 'function') {
                window.PretoCerrarVisor();
            }

            // Si ya hay otro modal abierto, cerrarlo sin liberar scroll ni emitir cierre
            if (this.activeModal && this.activeModal !== modalEl) {
                this.close(false);
            }

            this.triggerEl = triggerEl || document.activeElement;
            document.documentElement.classList.add('modal-abierto');
            document.body.classList.add('modal-abierto');
            window.dispatchEvent(new CustomEvent('preto:modal-state', { detail: { open: true } }));

            const dialog = modalEl.querySelector('.glass-modal-dialog');
            if (dialog) {
                if (!dialog.hasAttribute('tabindex')) {
                    dialog.setAttribute('tabindex', '-1');
                }
                dialog.scrollTop = 0;
            }

            modalEl.classList.add('is-active');
            modalEl.setAttribute('aria-hidden', 'false');
            this.activeModal = modalEl;

            if (this.focusTimer !== null) {
                clearTimeout(this.focusTimer);
                this.focusTimer = null;
            }

            this.focusTimer = setTimeout(() => {
                this.focusTimer = null;
                if (this.activeModal !== modalEl) return;

                if (this.esTactil()) {
                    if (dialog && typeof dialog.focus === 'function') {
                        dialog.focus({ preventScroll: true });
                    }
                } else {
                    const focusable = modalEl.querySelector('form input:not([type="hidden"]), form select, form textarea') || dialog;
                    if (focusable && typeof focusable.focus === 'function') {
                        focusable.focus({ preventScroll: true });
                    }
                }
            }, 80);
        },

        close: function(restoreScroll = true) {
            if (this.focusTimer !== null) {
                clearTimeout(this.focusTimer);
                this.focusTimer = null;
            }

            if (!this.activeModal) return;

            this.activeModal.classList.remove('is-active');
            this.activeModal.setAttribute('aria-hidden', 'true');
            this.activeModal = null;

            if (restoreScroll) {
                document.documentElement.classList.remove('modal-abierto');
                document.body.classList.remove('modal-abierto');
                window.dispatchEvent(new CustomEvent('preto:modal-state', { detail: { open: false } }));

                if (!this.esTactil() && this.triggerEl && typeof this.triggerEl.focus === 'function') {
                    this.triggerEl.focus({ preventScroll: true });
                }
                this.triggerEl = null;
            }
        },

        bindFormCotizar: function() {
            const form = document.getElementById('glass-form-cotizar');
            const feedback = document.getElementById('glass-cot-feedback');
            if (!form) return;

            form.addEventListener('submit', (e) => {
                e.preventDefault();

                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }

                const nombreEl = form.querySelector('[name="nombre"]');
                const estiloEl = form.querySelector('[name="estilo"]');
                const zonaEl = form.querySelector('[name="zona"]');
                const tamanoEl = form.querySelector('[name="tamano"]');
                const ideaEl = form.querySelector('[name="idea"]');

                const nombre = (nombreEl ? nombreEl.value : '').trim();
                const estilo = estiloEl ? estiloEl.value : 'Blackwork';
                const zona = (zonaEl ? zonaEl.value : '').trim();
                const tamano = (tamanoEl ? tamanoEl.value : '').trim();
                const idea = (ideaEl ? ideaEl.value : '').trim();

                const lineas = [
                    'Hola Preto Leone, quiero cotizar y agendar un tatuaje:',
                    '',
                    `▪ Cliente: ${nombre}`,
                    `▪ Estilo: ${estilo}`,
                    `▪ Zona del cuerpo: ${zona}`,
                    `▪ Tamaño aproximado: ${tamano}`,
                    `▪ Idea / referencia: ${idea || 'Por definir directamente en sesión'}`
                ];

                const mensaje = lineas.join('\n');
                const urlWa = `https://wa.me/18492506008?text=${encodeURIComponent(mensaje)}`;

                // Intentar abrir WhatsApp
                window.open(urlWa, '_blank', 'noopener,noreferrer');

                if (feedback) {
                    feedback.className = 'glass-feedback is-visible';
                    feedback.textContent = '';

                    const titleStrong = document.createElement('strong');
                    titleStrong.textContent = '✓ Cotización generada con éxito';
                    feedback.appendChild(titleStrong);
                    feedback.appendChild(document.createElement('br'));

                    feedback.appendChild(document.createTextNode(
                        'Se está abriendo WhatsApp (+1 849-250-6008). Si tu navegador bloqueó la ventana emergente, haz clic abajo:'
                    ));
                    feedback.appendChild(document.createElement('br'));

                    const link = document.createElement('a');
                    link.href = urlWa;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.textContent = 'Abrir chat en WhatsApp ↗';
                    feedback.appendChild(link);

                    const dialog = form.closest('.glass-modal-dialog');
                    if (dialog) {
                        dialog.scrollTo({ top: dialog.scrollHeight, behavior: 'smooth' });
                    }
                }
            });
        }
    };

    window.PretoModales = PretoModales;

    // Inicializar al cargar el DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => PretoModales.init());
    } else {
        PretoModales.init();
    }
})(window, document);
