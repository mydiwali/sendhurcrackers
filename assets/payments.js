/* Payment Management Vue app
 * Extracted from payments.html — no functional changes.
 * Requires Vue 3 global build and axios to be loaded on the page before this script.
 */
const { createApp } = Vue;

createApp({
    data() {
        return {
            currentTab: 'orders',
            orders: [],
            loading: false,
            searchOrder: '',
            filterPaymentStatus: '',
            selectedOrder: null,
            selectedOrderId: '',
            paymentForm: {
                amount: '',
                paymentMethod: '',
                referenceNumber: '',
                notes: ''
            },
            api: axios.create({
                baseURL: (window.APP_CONFIG && window.APP_CONFIG.apiBaseUrl) || '/api'
            })
        };
    },
    computed: {
        filteredOrders() {
            let filtered = this.orders;

            if (this.searchOrder) {
                const search = this.searchOrder.toLowerCase();
                filtered = filtered.filter(o =>
                    o.orderNumber.toLowerCase().includes(search) ||
                    (o.guestName && o.guestName.toLowerCase().includes(search)) ||
                    (o.email && o.email.toLowerCase().includes(search))
                );
            }

            if (this.filterPaymentStatus) {
                filtered = filtered.filter(o =>
                    o.paymentStatus.toLowerCase() === this.filterPaymentStatus.toLowerCase()
                );
            }

            return filtered;
        }
    },
    methods: {
        async fetchOrders() {
            this.loading = true;
            try {
                const response = await this.api.get('/admin/orders', {
                    params: {
                        size: 100,
                        paymentStatus: this.filterPaymentStatus ? this.filterPaymentStatus.toLowerCase() : undefined
                    }
                });
                this.orders = response.data.data.content || [];
            } catch (error) {
                alert('Error loading orders: ' + error.message);
            } finally {
                this.loading = false;
            }
        },
        async loadOrderDetails() {
            if (!this.selectedOrderId) {
                alert('Please enter an order ID or order number');
                return;
            }

            try {
                const response = await this.api.get(`/admin/orders/${this.selectedOrderId}`);
                this.selectedOrder = response.data.data;

                // Load payment details
                const paymentResponse = await this.api.get(`/payments/${this.selectedOrderId}`);
                this.selectedOrder.payments = paymentResponse.data.data.payments;
                this.selectedOrder.amountCollected = paymentResponse.data.data.amountCollected;
                this.selectedOrder.balanceDue = paymentResponse.data.data.balanceDue;
                this.selectedOrder.paymentStatus = paymentResponse.data.data.paymentStatus;

                // Clear form
                this.paymentForm = {
                    amount: '',
                    paymentMethod: '',
                    referenceNumber: '',
                    notes: ''
                };
            } catch (error) {
                alert('Order not found: ' + (error.response?.data?.error || error.message));
            }
        },
        selectOrderForPayment(order) {
            this.selectedOrderId = order.id;
            this.currentTab = 'record';
            this.loadOrderDetails();
        },
        async recordPayment() {
            if (!this.paymentForm.amount || !this.paymentForm.paymentMethod) {
                alert('Please fill in amount and payment method');
                return;
            }

            try {
                await this.api.post(`/payments/${this.selectedOrder.id}`, this.paymentForm);
                alert('Payment recorded successfully!');
                await this.loadOrderDetails();
                await this.fetchOrders();
            } catch (error) {
                alert('Error recording payment: ' + (error.response?.data?.error || error.message));
            }
        },
        async deletePayment(paymentId) {
            if (!confirm('Are you sure you want to delete this payment?')) return;

            try {
                await this.api.delete(`/payments/${paymentId}`);
                alert('Payment deleted successfully!');
                await this.loadOrderDetails();
                await this.fetchOrders();
            } catch (error) {
                alert('Error deleting payment: ' + (error.response?.data?.error || error.message));
            }
        },
        getPaymentBadgeClass(status) {
            if (status === 'Paid') return 'badge-paid';
            if (status === 'Partial Payment') return 'badge-partial';
            return 'badge-unpaid';
        },
        formatDate(dateObj) {
            if (!dateObj) return '';
            const timestamp = dateObj.seconds * 1000;
            return new Date(timestamp).toLocaleDateString();
        }
    },
    mounted() {
        this.fetchOrders();
    }
}).mount('#app');
