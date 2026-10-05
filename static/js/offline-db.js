/**
 * offline-db.js
 * Gerenciador do IndexedDB para armazenamento offline
 */

const DB_NAME = 'ElpObraFlowDB';
const DB_VERSION = 1;

const STORES = {
    REPORTS: 'reports',
    PHOTOS: 'photos',
    SYNC_QUEUE: 'syncQueue'
};

const OfflineDB = {
    db: null,

    /**
     * Abre a conexão com o banco de dados
     */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Store para relatórios
                if (!db.objectStoreNames.contains(STORES.REPORTS)) {
                    db.createObjectStore(STORES.REPORTS, { keyPath: 'id' });
                }

                // Store para fotos (vinculadas ao relatório por reportId)
                if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
                    const photoStore = db.createObjectStore(STORES.PHOTOS, { keyPath: 'id' });
                    photoStore.createIndex('reportId', 'reportId', { unique: false });
                }

                // Fila de sincronização
                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ IndexedDB conectado');
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('❌ Erro ao abrir IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    },

    /**
     * Helper genérico para transações
     */
    async transaction(storeName, mode, callback) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = callback(store);

            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
        });
    },

    // --- Relatórios ---

    async saveReport(report) {
        // Garante que tenha ID e timestamp
        if (!report.id) report.id = crypto.randomUUID();
        if (!report.createdAt) report.createdAt = new Date().toISOString();
        report.synced = false;

        return this.transaction(STORES.REPORTS, 'readwrite', (store) => {
            return store.put(report);
        });
    },

    async getReport(id) {
        return this.transaction(STORES.REPORTS, 'readonly', (store) => {
            return store.get(id);
        });
    },

    async getAllReports() {
        return this.transaction(STORES.REPORTS, 'readonly', (store) => {
            return store.getAll();
        });
    },

    async deleteReport(id) {
        // Primeiro remove as fotos associadas
        await this.deletePhotosByReport(id);
        return this.transaction(STORES.REPORTS, 'readwrite', (store) => {
            return store.delete(id);
        });
    },

    // --- Fotos ---

    async savePhoto(photoBlob, reportId, category) {
        const photo = {
            id: crypto.randomUUID(),
            reportId: reportId,
            blob: photoBlob,
            category: category,
            createdAt: new Date().toISOString()
        };

        await this.transaction(STORES.PHOTOS, 'readwrite', (store) => {
            store.put(photo);
        });
        
        return photo.id;
    },

    async getPhotosByReport(reportId) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORES.PHOTOS, 'readonly');
            const store = tx.objectStore(STORES.PHOTOS);
            const index = store.index('reportId');
            const request = index.getAll(reportId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async deletePhotosByReport(reportId) {
        const photos = await this.getPhotosByReport(reportId);
        const db = await this.open();
        const tx = db.transaction(STORES.PHOTOS, 'readwrite');
        const store = tx.objectStore(STORES.PHOTOS);

        photos.forEach(photo => store.delete(photo.id));
        
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
        });
    },

    // --- Fila de Sincronização ---

    async addToSyncQueue(item) {
        return this.transaction(STORES.SYNC_QUEUE, 'readwrite', (store) => {
            return store.add({
                ...item,
                addedAt: new Date().toISOString(),
                status: 'pending' // pending, processing, failed
            });
        });
    },

    async getSyncQueue() {
        return this.transaction(STORES.SYNC_QUEUE, 'readonly', (store) => {
            return store.getAll();
        });
    },

    async removeFromSyncQueue(id) {
        return this.transaction(STORES.SYNC_QUEUE, 'readwrite', (store) => {
            return store.delete(id);
        });
    },
    
    async clearSyncQueue() {
        return this.transaction(STORES.SYNC_QUEUE, 'readwrite', (store) => {
            return store.clear();
        });
    }
};

// Tornar global para uso em outros scripts
window.OfflineDB = OfflineDB;
console.log('📦 Módulo OfflineDB carregado');
