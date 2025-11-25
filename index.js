// Aplicación de Gestión de Estacionamientos
class ParkingManager {
    constructor() {
        this.init();
    }

    init() {
        // Inicializar datos si no existen
        this.initializeData();
        
        // Configurar eventos
        this.setupEventListeners();
        
        // Actualizar interfaz
        this.updateDateTime();
        this.loadRates();
        this.loadParkedVehicles();
        this.updateReports();
        
        // Actualizar fecha y hora cada segundo
        setInterval(() => this.updateDateTime(), 1000);
        
        // Verificar estado del turno
        this.checkShiftStatus();
    }

    // Inicializar datos en localStorage
    initializeData() {
        if (!localStorage.getItem('parkingRates')) {
            const defaultRates = [
                { id: 1, name: 'Tarifa Estándar', type: 'minute', costPerMinute: 0.05, dailyRate: 0, status: 'active' },
                { id: 2, name: 'Tarifa Diaria', type: 'daily', costPerMinute: 0, dailyRate: 20, status: 'active' }
            ];
            localStorage.setItem('parkingRates', JSON.stringify(defaultRates));
        }

        if (!localStorage.getItem('parkingTransactions')) {
            localStorage.setItem('parkingTransactions', JSON.stringify([]));
        }

        if (!localStorage.getItem('parkingShift')) {
            localStorage.setItem('parkingShift', JSON.stringify({ isOpen: false, openTime: null, closeTime: null, initialBalance: 0 }));
        }
    }

    // Configurar event listeners
    setupEventListeners() {
        // Navegación entre módulos
        document.querySelectorAll('.nav-button').forEach(button => {
            button.addEventListener('click', (e) => {
                const module = e.currentTarget.dataset.module;
                this.switchModule(module);
            });
        });

        // Eventos del módulo POS
        document.getElementById('register-entry').addEventListener('click', () => this.registerEntry());
        document.getElementById('register-exit').addEventListener('click', () => this.prepareExit());
        document.getElementById('confirm-exit').addEventListener('click', () => this.confirmExit());
        document.getElementById('vehicle-plate').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.registerEntry();
        });

        // Eventos de gestión de turnos
        document.getElementById('open-shift').addEventListener('click', () => this.openShift());
        document.getElementById('close-shift').addEventListener('click', () => this.closeShift());

        // Eventos del módulo de tarifas
        document.getElementById('add-rate').addEventListener('click', () => this.showRateForm());
        document.getElementById('cancel-rate').addEventListener('click', () => this.hideRateForm());
        document.getElementById('rate-form').addEventListener('submit', (e) => this.saveRate(e));
        document.getElementById('rate-type').addEventListener('change', (e) => this.toggleRateFields(e.target.value));

        // Eventos del módulo de reportes
        document.getElementById('report-period').addEventListener('change', (e) => this.toggleCustomDateRange(e.target.value));
        document.getElementById('generate-report').addEventListener('click', () => this.generateReport());
        document.getElementById('export-csv').addEventListener('click', () => this.exportToCSV());
    }

    // Navegación entre módulos
    switchModule(moduleName) {
        // Ocultar todos los módulos
        document.querySelectorAll('.module').forEach(module => {
            module.classList.remove('active');
        });

        // Desactivar todos los botones de navegación
        document.querySelectorAll('.nav-button').forEach(button => {
            button.classList.remove('active');
        });

        // Mostrar módulo seleccionado
        document.getElementById(`${moduleName}-module`).classList.add('active');
        
        // Activar botón correspondiente
        document.querySelector(`[data-module="${moduleName}"]`).classList.add('active');

        // Actualizar datos específicos del módulo
        if (moduleName === 'rates') {
            this.loadRates();
        } else if (moduleName === 'reports') {
            this.updateReports();
        }
    }

    // Actualizar fecha y hora en tiempo real
    updateDateTime() {
        const now = new Date();
        const dateString = now.toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const timeString = now.toLocaleTimeString('es-ES');
        
        document.getElementById('current-date').textContent = dateString.charAt(0).toUpperCase() + dateString.slice(1);
        document.getElementById('current-time').textContent = timeString;
    }

    // ========== MÓDULO PUNTO DE VENTA ==========

    // Registrar entrada de vehículo
    registerEntry() {
        const plate = document.getElementById('vehicle-plate').value.trim().toUpperCase();
        const rateId = parseInt(document.getElementById('rate-selector').value);
        
        if (!plate) {
            this.showNotification('Por favor, ingresa la matrícula del vehículo', 'error');
            return;
        }
        
        if (!rateId) {
            this.showNotification('Por favor, selecciona una tarifa', 'error');
            return;
        }
        
        // Verificar si el turno está abierto
        const shift = JSON.parse(localStorage.getItem('parkingShift'));
        if (!shift.isOpen) {
            this.showNotification('Debes abrir el turno antes de registrar entradas', 'error');
            return;
        }
        
        // Verificar si el vehículo ya está estacionado
        const parkedVehicles = JSON.parse(localStorage.getItem('parkingTransactions') || '[]')
            .filter(t => !t.exitTime && t.plate === plate);
            
        if (parkedVehicles.length > 0) {
            this.showNotification('Este vehículo ya está registrado como estacionado', 'error');
            return;
        }
        
        // Registrar entrada
        const transaction = {
            id: Date.now(),
            plate: plate,
            entryTime: new Date().toISOString(),
            exitTime: null,
            rateId: rateId,
            amount: 0,
            status: 'parked'
        };
        
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        transactions.push(transaction);
        localStorage.setItem('parkingTransactions', JSON.stringify(transactions));
        
        // Limpiar campo y actualizar lista
        document.getElementById('vehicle-plate').value = '';
        this.loadParkedVehicles();
        this.showNotification(`Entrada registrada para ${plate}`, 'success');
    }

    // Preparar salida de vehículo
    prepareExit() {
        const plate = document.getElementById('vehicle-plate').value.trim().toUpperCase();
        
        if (!plate) {
            this.showNotification('Por favor, ingresa la matrícula del vehículo', 'error');
            return;
        }
        
        // Buscar vehículo estacionado
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        const parkedVehicle = transactions.find(t => !t.exitTime && t.plate === plate);
        
        if (!parkedVehicle) {
            this.showNotification('No se encontró un vehículo estacionado con esa matrícula', 'error');
            return;
        }
        
        // Obtener tarifa aplicable
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        const rate = rates.find(r => r.id === parkedVehicle.rateId);
        
        if (!rate) {
            this.showNotification('Error: Tarifa no encontrada', 'error');
            return;
        }
        
        // Calcular costo
        const entryTime = new Date(parkedVehicle.entryTime);
        const exitTime = new Date();
        const parkedMinutes = Math.max(1, Math.floor((exitTime - entryTime) / (1000 * 60)));
        
        let amount = 0;
        if (rate.type === 'minute') {
            amount = parkedMinutes * rate.costPerMinute;
        } else if (rate.type === 'daily') {
            // Para tarifa diaria, cobrar por días completos
            const days = Math.ceil(parkedMinutes / (24 * 60));
            amount = days * rate.dailyRate;
        }
        
        // Mostrar detalles de salida
        document.getElementById('exit-plate').textContent = parkedVehicle.plate;
        document.getElementById('entry-time').textContent = entryTime.toLocaleString('es-ES');
        document.getElementById('exit-time').textContent = exitTime.toLocaleString('es-ES');
        document.getElementById('parked-time').textContent = this.formatParkingTime(parkedMinutes);
        document.getElementById('total-cost').textContent = `$${amount.toFixed(2)}`;
        
        // Mostrar calculadora de salida
        document.getElementById('exit-calculator').classList.remove('hidden');
        
        // Guardar datos temporalmente para confirmación
        this.pendingExit = {
            transactionId: parkedVehicle.id,
            amount: amount,
            exitTime: exitTime.toISOString()
        };
    }

    // Confirmar salida de vehículo
    confirmExit() {
        if (!this.pendingExit) return;
        
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        const transactionIndex = transactions.findIndex(t => t.id === this.pendingExit.transactionId);
        
        if (transactionIndex !== -1) {
            transactions[transactionIndex].exitTime = this.pendingExit.exitTime;
            transactions[transactionIndex].amount = this.pendingExit.amount;
            transactions[transactionIndex].status = 'completed';
            
            localStorage.setItem('parkingTransactions', JSON.stringify(transactions));
            
            // Ocultar calculadora y limpiar datos
            document.getElementById('exit-calculator').classList.add('hidden');
            document.getElementById('vehicle-plate').value = '';
            this.pendingExit = null;
            
            // Actualizar interfaces
            this.loadParkedVehicles();
            this.updateReports();
            this.showNotification('Salida registrada exitosamente', 'success');
        }
    }

    // Cargar vehículos estacionados
    loadParkedVehicles() {
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        const parkedVehicles = transactions.filter(t => !t.exitTime);
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        
        const vehiclesList = document.getElementById('parked-vehicles-list');
        vehiclesList.innerHTML = '';
        
        if (parkedVehicles.length === 0) {
            vehiclesList.innerHTML = '<div class="empty-state">No hay vehículos estacionados</div>';
            return;
        }
        
        parkedVehicles.forEach(vehicle => {
            const rate = rates.find(r => r.id === vehicle.rateId);
            const entryTime = new Date(vehicle.entryTime);
            const now = new Date();
            const parkedMinutes = Math.floor((now - entryTime) / (1000 * 60));
            
            const vehicleElement = document.createElement('div');
            vehicleElement.className = 'vehicle-item';
            vehicleElement.innerHTML = `
                <div class="vehicle-info">
                    <div class="vehicle-plate">${vehicle.plate}</div>
                    <div class="vehicle-time">Entrada: ${entryTime.toLocaleString('es-ES')}</div>
                    <div class="vehicle-time">Tiempo: ${this.formatParkingTime(parkedMinutes)}</div>
                    <div class="vehicle-time">Tarifa: ${rate ? rate.name : 'N/A'}</div>
                </div>
            `;
            
            vehiclesList.appendChild(vehicleElement);
        });
    }

    // ========== MÓDULO TARIFAS ==========

    // Cargar y mostrar tarifas
    loadRates() {
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        const ratesList = document.getElementById('rates-list');
        const rateSelector = document.getElementById('rate-selector');
        
        // Actualizar selector de tarifas en módulo POS
        rateSelector.innerHTML = '';
        rates.filter(rate => rate.status === 'active').forEach(rate => {
            const option = document.createElement('option');
            option.value = rate.id;
            option.textContent = rate.name;
            rateSelector.appendChild(option);
        });
        
        // Actualizar lista de tarifas en módulo de gestión
        ratesList.innerHTML = '';
        
        if (rates.length === 0) {
            ratesList.innerHTML = '<div class="empty-state">No hay tarifas configuradas</div>';
            return;
        }
        
        rates.forEach(rate => {
            const rateElement = document.createElement('div');
            rateElement.className = 'rate-item';
            
            let rateDetails = '';
            if (rate.type === 'minute') {
                rateDetails = `$${rate.costPerMinute.toFixed(2)} por minuto`;
            } else if (rate.type === 'daily') {
                rateDetails = `$${rate.dailyRate.toFixed(2)} por día`;
            }
            
            rateElement.innerHTML = `
                <div class="rate-info">
                    <div class="rate-name">${rate.name}</div>
                    <div class="rate-details">${rateDetails} • ${rate.type === 'minute' ? 'Por minuto' : 'Tarifa diaria'}</div>
                </div>
                <div class="rate-status ${rate.status === 'active' ? 'status-active' : 'status-inactive'}">
                    ${rate.status === 'active' ? 'Activa' : 'Inactiva'}
                </div>
                <div class="rate-actions">
                    <button class="action-btn edit-btn" data-rate-id="${rate.id}">✏️</button>
                    <button class="action-btn delete-btn" data-rate-id="${rate.id}">🗑️</button>
                </div>
            `;
            
            ratesList.appendChild(rateElement);
        });
        
        // Agregar event listeners a los botones de editar/eliminar
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rateId = parseInt(e.currentTarget.dataset.rateId);
                this.editRate(rateId);
            });
        });
        
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rateId = parseInt(e.currentTarget.dataset.rateId);
                this.deleteRate(rateId);
            });
        });
    }

    // Mostrar formulario de tarifa
    showRateForm(rate = null) {
        const formContainer = document.getElementById('rate-form-container');
        const formTitle = document.getElementById('rate-form-title');
        
        if (rate) {
            // Modo edición
            formTitle.textContent = 'Editar Tarifa';
            document.getElementById('rate-name').value = rate.name;
            document.getElementById('rate-type').value = rate.type;
            document.getElementById('cost-per-minute').value = rate.costPerMinute;
            document.getElementById('daily-rate').value = rate.dailyRate;
            document.getElementById('rate-status').value = rate.status;
            this.editingRateId = rate.id;
        } else {
            // Modo creación
            formTitle.textContent = 'Nueva Tarifa';
            document.getElementById('rate-form').reset();
            this.editingRateId = null;
        }
        
        // Mostrar campos según tipo de tarifa
        this.toggleRateFields(document.getElementById('rate-type').value);
        
        formContainer.classList.remove('hidden');
    }

    // Ocultar formulario de tarifa
    hideRateForm() {
        document.getElementById('rate-form-container').classList.add('hidden');
        this.editingRateId = null;
    }

    // Alternar campos según tipo de tarifa
    toggleRateFields(rateType) {
        const minuteGroup = document.getElementById('minute-rate-group');
        const dailyGroup = document.getElementById('daily-rate-group');
        
        if (rateType === 'minute') {
            minuteGroup.classList.remove('hidden');
            dailyGroup.classList.add('hidden');
        } else if (rateType === 'daily') {
            minuteGroup.classList.add('hidden');
            dailyGroup.classList.remove('hidden');
        }
    }

    // Guardar tarifa (crear o editar)
    saveRate(e) {
        e.preventDefault();
        
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        const rateData = {
            name: document.getElementById('rate-name').value,
            type: document.getElementById('rate-type').value,
            costPerMinute: parseFloat(document.getElementById('cost-per-minute').value) || 0,
            dailyRate: parseFloat(document.getElementById('daily-rate').value) || 0,
            status: document.getElementById('rate-status').value
        };
        
        if (!rateData.name) {
            this.showNotification('Por favor, ingresa un nombre para la tarifa', 'error');
            return;
        }
        
        if (this.editingRateId) {
            // Editar tarifa existente
            const rateIndex = rates.findIndex(r => r.id === this.editingRateId);
            if (rateIndex !== -1) {
                rates[rateIndex] = { ...rates[rateIndex], ...rateData };
                this.showNotification('Tarifa actualizada exitosamente', 'success');
            }
        } else {
            // Crear nueva tarifa
            const newRate = {
                id: Date.now(),
                ...rateData
            };
            rates.push(newRate);
            this.showNotification('Tarifa creada exitosamente', 'success');
        }
        
        localStorage.setItem('parkingRates', JSON.stringify(rates));
        this.loadRates();
        this.hideRateForm();
    }

    // Editar tarifa
    editRate(rateId) {
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        const rate = rates.find(r => r.id === rateId);
        
        if (rate) {
            this.showRateForm(rate);
        }
    }

    // Eliminar tarifa
    deleteRate(rateId) {
        if (confirm('¿Estás seguro de que quieres eliminar esta tarifa?')) {
            const rates = JSON.parse(localStorage.getItem('parkingRates'));
            const updatedRates = rates.filter(r => r.id !== rateId);
            
            localStorage.setItem('parkingRates', JSON.stringify(updatedRates));
            this.loadRates();
            this.showNotification('Tarifa eliminada exitosamente', 'success');
        }
    }

    // ========== MÓDULO REPORTES ==========

    // Actualizar reportes
    updateReports() {
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        
        // Calcular estadísticas
        const completedTransactions = transactions.filter(t => t.status === 'completed');
        const parkedVehicles = transactions.filter(t => !t.exitTime);
        
        const totalVehicles = completedTransactions.length;
        const totalIncome = completedTransactions.reduce((sum, t) => sum + t.amount, 0);
        const avgStay = completedTransactions.length > 0 
            ? completedTransactions.reduce((sum, t) => {
                const entryTime = new Date(t.entryTime);
                const exitTime = new Date(t.exitTime);
                return sum + (exitTime - entryTime) / (1000 * 60);
            }, 0) / completedTransactions.length 
            : 0;
        
        // Actualizar estadísticas
        document.getElementById('total-vehicles').textContent = totalVehicles;
        document.getElementById('total-income').textContent = `$${totalIncome.toFixed(2)}`;
        document.getElementById('avg-stay').textContent = `${Math.round(avgStay)} min`;
        document.getElementById('current-parked').textContent = parkedVehicles.length;
        
        // Actualizar transacciones recientes
        this.updateTransactionsList(completedTransactions.slice(-10).reverse());
        
        // Actualizar estadísticas por tarifa
        this.updateRatesStats(completedTransactions, rates);
    }

    // Actualizar lista de transacciones
    updateTransactionsList(transactions) {
        const transactionsList = document.getElementById('transactions-list');
        transactionsList.innerHTML = '';
        
        if (transactions.length === 0) {
            transactionsList.innerHTML = '<div class="empty-state">No hay transacciones registradas</div>';
            return;
        }
        
        transactions.forEach(transaction => {
            const entryTime = new Date(transaction.entryTime);
            const exitTime = new Date(transaction.exitTime);
            
            const transactionElement = document.createElement('div');
            transactionElement.className = 'transaction-item';
            transactionElement.innerHTML = `
                <div class="transaction-info">
                    <div class="transaction-plate">${transaction.plate}</div>
                    <div class="transaction-time">${entryTime.toLocaleDateString('es-ES')} ${entryTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div class="transaction-amount">$${transaction.amount.toFixed(2)}</div>
            `;
            
            transactionsList.appendChild(transactionElement);
        });
    }

    // Actualizar estadísticas por tarifa
    updateRatesStats(transactions, rates) {
        const ratesStats = document.getElementById('rates-stats');
        ratesStats.innerHTML = '';
        
        // Contar transacciones por tarifa
        const rateCounts = {};
        transactions.forEach(transaction => {
            if (!rateCounts[transaction.rateId]) {
                rateCounts[transaction.rateId] = 0;
            }
            rateCounts[transaction.rateId]++;
        });
        
        // Crear elementos de estadísticas
        Object.keys(rateCounts).forEach(rateId => {
            const rate = rates.find(r => r.id === parseInt(rateId));
            if (rate) {
                const statElement = document.createElement('div');
                statElement.className = 'rate-stat-item';
                statElement.innerHTML = `
                    <div class="rate-stat-name">${rate.name}</div>
                    <div class="rate-stat-count">${rateCounts[rateId]} vehículos</div>
                `;
                ratesStats.appendChild(statElement);
            }
        });
        
        if (Object.keys(rateCounts).length === 0) {
            ratesStats.innerHTML = '<div class="empty-state">No hay datos de uso de tarifas</div>';
        }
    }

    // Generar reporte según filtros
    generateReport() {
        // En una implementación real, aquí se aplicarían los filtros
        // Por simplicidad, recargamos los reportes actuales
        this.updateReports();
        this.showNotification('Reporte generado exitosamente', 'success');
    }

    // Exportar a CSV
    exportToCSV() {
        const transactions = JSON.parse(localStorage.getItem('parkingTransactions'));
        const rates = JSON.parse(localStorage.getItem('parkingRates'));
        
        // Filtrar solo transacciones completadas
        const completedTransactions = transactions.filter(t => t.status === 'completed');
        
        if (completedTransactions.length === 0) {
            this.showNotification('No hay datos para exportar', 'error');
            return;
        }
        
        // Crear contenido CSV
        let csvContent = 'Matrícula,Fecha Entrada,Hora Entrada,Fecha Salida,Hora Salida,Tiempo Estacionado (min),Tarifa,Costo\n';
        
        completedTransactions.forEach(transaction => {
            const entryTime = new Date(transaction.entryTime);
            const exitTime = new Date(transaction.exitTime);
            const parkedMinutes = Math.floor((exitTime - entryTime) / (1000 * 60));
            const rate = rates.find(r => r.id === transaction.rateId);
            
            csvContent += `"${transaction.plate}",`;
            csvContent += `"${entryTime.toLocaleDateString('es-ES')}",`;
            csvContent += `"${entryTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}",`;
            csvContent += `"${exitTime.toLocaleDateString('es-ES')}",`;
            csvContent += `"${exitTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}",`;
            csvContent += `"${parkedMinutes}",`;
            csvContent += `"${rate ? rate.name : 'N/A'}",`;
            csvContent += `"${transaction.amount.toFixed(2)}"\n`;
        });
        
        // Crear y descargar archivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_estacionamiento_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification('Datos exportados exitosamente', 'success');
    }

    // Alternar visibilidad del rango de fechas personalizado
    toggleCustomDateRange(period) {
        const customRange = document.getElementById('custom-date-range');
        if (period === 'custom') {
            customRange.classList.remove('hidden');
        } else {
            customRange.classList.add('hidden');
        }
    }

    // ========== GESTIÓN DE TURNOS ==========

    // Verificar estado del turno
    checkShiftStatus() {
        const shift = JSON.parse(localStorage.getItem('parkingShift'));
        const openBtn = document.getElementById('open-shift');
        const closeBtn = document.getElementById('close-shift');
        const status = document.getElementById('shift-status');
        
        if (shift.isOpen) {
            openBtn.disabled = true;
            closeBtn.disabled = false;
            status.textContent = 'Turno Abierto';
            status.style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
            status.style.color = '#27ae60';
        } else {
            openBtn.disabled = false;
            closeBtn.disabled = true;
            status.textContent = 'Turno Cerrado';
            status.style.backgroundColor = 'rgba(149, 165, 166, 0.2)';
            status.style.color = '#95a5a6';
        }
    }

    // Abrir turno
    openShift() {
        const shift = {
            isOpen: true,
            openTime: new Date().toISOString(),
            closeTime: null,
            initialBalance: 0 // En una implementación real, se podría ingresar el balance inicial
        };
        
        localStorage.setItem('parkingShift', JSON.stringify(shift));
        this.checkShiftStatus();
        this.showNotification('Turno abierto exitosamente', 'success');
    }

    // Cerrar turno
    closeShift() {
        if (confirm('¿Estás seguro de que quieres cerrar el turno? Esto generará un reporte de cierre.')) {
            const shift = JSON.parse(localStorage.getItem('parkingShift'));
            shift.isOpen = false;
            shift.closeTime = new Date().toISOString();
            
            localStorage.setItem('parkingShift', JSON.stringify(shift));
            this.checkShiftStatus();
            this.showNotification('Turno cerrado exitosamente', 'success');
            
            // En una implementación real, aquí se generaría un reporte de cierre
        }
    }

    // ========== UTILIDADES ==========

    // Formatear tiempo de estacionamiento
    formatParkingTime(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}min`;
        }
    }

    // Mostrar notificación
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.remove('hidden');
        
        // Ocultar después de 3 segundos
        setTimeout(() => {
            notification.classList.add('hidden');
        }, 3000);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new ParkingManager();
});