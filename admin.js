// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function () {
    // Mobile Menu Toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    if (mobileMenuToggle && sidebar && sidebarOverlay) {
        // Toggle sidebar on button click
        mobileMenuToggle.addEventListener('click', function () {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });

        // Close sidebar when overlay is clicked
        sidebarOverlay.addEventListener('click', function () {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });

        // Close sidebar when a menu item is clicked (on mobile)
        const sidebarLinks = sidebar.querySelectorAll('.sidebar-nav-link');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', function () {
                // On mobile, close the sidebar after clicking
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    sidebarOverlay.classList.remove('active');
                }
            });
        });
    }

    // Initialize variables
    let currentFilter = 'all';
    let registrations = [];
    let currentRegistrationId = null;
    let currentPage = 1;
    const itemsPerPage = 10;

    // DOM Elements
    const searchInput = document.getElementById('search-input');
    const registrationsList = document.getElementById('registrations-list');
    const loadingElement = document.getElementById('loading');
    const noResultsElement = document.getElementById('no-results');
    const statusSelect = document.getElementById('status-select');
    const saveStatusBtn = document.getElementById('save-status-btn');
    const rejectionReasonContainer = document.getElementById('rejection-reason-container');
    const rejectionReason = document.getElementById('rejection-reason');
    const paginationContainer = document.getElementById('pagination-container');

    // Event Listeners
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentPage = 1;
            filterAndDisplayRegistrations();
        });
    }

    // Add click handlers to filter buttons
    const filterButtons = document.querySelectorAll('[data-filter]');
    if (filterButtons.length > 0) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                currentFilter = e.currentTarget.dataset.filter;
                currentPage = 1;

                // Update active state
                const activeBtn = document.querySelector('.list-group-item.active, .filter-btn.active');
                if (activeBtn) {
                    activeBtn.classList.remove('active');
                }
                e.currentTarget.classList.add('active');

                filterAndDisplayRegistrations();
            });
        });
    }

    // Add change handler for status select
    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            if (rejectionReasonContainer) {
                rejectionReasonContainer.style.display = e.target.value === 'rejected' ? 'block' : 'none';
            }
        });
    }

    // Initialize modals
    const statusModal = new bootstrap.Modal(document.getElementById('statusModal'));
    const deleteConfirmModal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));

    // Initialize the dashboard
    initializeDashboard();

    // Delete button click handler
    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', function () {
            statusModal.hide();
            deleteConfirmModal.show();
        });
    }

    // Confirm delete button click handler
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async function () {
            if (!currentRegistrationId) return;

            try {
                await db.collection('registrations').doc(currentRegistrationId).delete();
                deleteConfirmModal.hide();
                loadRegistrations(); // Refresh the list
                showAlert('Registration deleted successfully!', 'success');
            } catch (error) {
                console.error('Error deleting registration:', error);
                showAlert('Failed to delete registration. Please try again.', 'danger');
            }
        });
    }

    // Save status button click handler
    if (saveStatusBtn) {
        saveStatusBtn.addEventListener('click', updateStatus);
    }

    // Initialize the dashboard
    function initializeDashboard() {
        console.log('Initializing dashboard...');
        loadRegistrations();
    }

    // Load registrations from Firestore
    async function loadRegistrations() {
        try {
            loadingElement.classList.remove('d-none');
            noResultsElement.classList.add('d-none');
            registrationsList.innerHTML = '';

            // CRITICAL FIX: Remove orderBy to fetch ALL documents
            // Documents missing 'submissionTime' field were being excluded
            const querySnapshot = await db.collection('registrations').get();

            // Process all documents with robust null checking
            registrations = querySnapshot.docs.map(doc => {
                const data = doc.data();

                // Log any documents that might have been missing before
                if (!data.submissionTime) {
                    console.warn('Document missing submissionTime:', doc.id, data);
                }

                // Return with safe defaults
                return {
                    id: doc.id,
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    country: data.country || '',
                    dietary: data.dietary || '',
                    status: data.status || 'pending',
                    submissionTime: data.submissionTime || Date.now(),
                    rejectionReason: data.rejectionReason || null
                };
            });

            // Sort on client-side (newest first)
            registrations.sort((a, b) => {
                const timeA = typeof a.submissionTime === 'number' ? a.submissionTime :
                    a.submissionTime?.toMillis ? a.submissionTime.toMillis() : 0;
                const timeB = typeof b.submissionTime === 'number' ? b.submissionTime :
                    b.submissionTime?.toMillis ? b.submissionTime.toMillis() : 0;
                return timeB - timeA;
            });

            console.log(`Loaded ${registrations.length} registrations`);
            updateCounts();
            updateStats();
            filterAndDisplayRegistrations();
        } catch (error) {
            console.error('Error loading registrations:', error);
            showAlert('Failed to load registrations: ' + error.message, 'danger');
        } finally {
            loadingElement.classList.add('d-none');
        }
    }

    // Update counts in sidebar
    function updateCounts() {
        const counts = {
            pending: 0,
            approved: 0,
            rejected: 0
        };

        registrations.forEach(reg => {
            if (counts.hasOwnProperty(reg.status)) {
                counts[reg.status]++;
            }
        });

        const pendingCountEl = document.getElementById('pending-count');
        const approvedCountEl = document.getElementById('approved-count');
        const rejectedCountEl = document.getElementById('rejected-count');

        if (pendingCountEl) pendingCountEl.textContent = counts.pending;
        if (approvedCountEl) approvedCountEl.textContent = counts.approved;
        if (rejectedCountEl) rejectedCountEl.textContent = counts.rejected;
    }

    // Update stats cards
    function updateStats() {
        const counts = {
            total: registrations.length,
            pending: 0,
            approved: 0,
            rejected: 0
        };

        registrations.forEach(reg => {
            if (counts.hasOwnProperty(reg.status)) {
                counts[reg.status]++;
            }
        });

        const totalStatEl = document.getElementById('stat-total');
        const pendingStatEl = document.getElementById('stat-pending');
        const approvedStatEl = document.getElementById('stat-approved');
        const rejectedStatEl = document.getElementById('stat-rejected');

        if (totalStatEl) totalStatEl.textContent = counts.total;
        if (pendingStatEl) pendingStatEl.textContent = counts.pending;
        if (approvedStatEl) approvedStatEl.textContent = counts.approved;
        if (rejectedStatEl) rejectedStatEl.textContent = counts.rejected;
    }

    // Filter and display registrations
    function filterAndDisplayRegistrations() {
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        const filtered = registrations.filter(reg => {
            // Safe string operations with null checks
            const matchesSearch =
                (reg.firstName?.toLowerCase() || '').includes(searchTerm) ||
                (reg.lastName?.toLowerCase() || '').includes(searchTerm) ||
                (reg.email?.toLowerCase() || '').includes(searchTerm);

            const matchesFilter =
                currentFilter === 'all' ||
                reg.status === currentFilter;

            return matchesSearch && matchesFilter;
        });

        displayRegistrations(filtered);
    }

    // Display registrations in table
    function displayRegistrations(filteredRegistrations) {
        registrationsList.innerHTML = '';

        if (filteredRegistrations.length === 0) {
            noResultsElement.classList.remove('d-none');
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        noResultsElement.classList.add('d-none');

        // Calculate pagination
        const totalPages = Math.ceil(filteredRegistrations.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const pageRegistrations = filteredRegistrations.slice(startIndex, endIndex);

        // Build table
        const table = document.createElement('table');
        table.className = 'table table-hover';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th class="hide-on-tablet">Phone</th>
                    <th class="hide-on-tablet">Country</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="table-body">
            </tbody>
        `;

        const tbody = table.querySelector('#table-body');

        pageRegistrations.forEach(reg => {
            const statusClass = {
                pending: 'warning',
                approved: 'success',
                rejected: 'danger'
            }[reg.status] || 'secondary';

            const submissionDate = typeof reg.submissionTime === 'number'
                ? new Date(reg.submissionTime).toLocaleDateString()
                : reg.submissionTime?.toDate
                    ? reg.submissionTime.toDate().toLocaleDateString()
                    : 'N/A';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${reg.firstName} ${reg.lastName}</td>
                <td>${reg.email}</td>
                <td class="hide-on-tablet">${reg.phone}</td>
                <td class="hide-on-tablet">${reg.country}</td>
                <td><span class="badge bg-${statusClass}">${reg.status}</span></td>
                <td>${submissionDate}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-status" data-id="${reg.id}" title="Update Status">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(row);
        });

        registrationsList.appendChild(table);

        // Add event listeners to edit buttons
        document.querySelectorAll('.edit-status').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const registrationId = e.currentTarget.dataset.id;
                const registration = registrations.find(r => r.id === registrationId);

                if (registration) {
                    currentRegistrationId = registrationId;
                    if (statusSelect) {
                        statusSelect.value = registration.status || 'pending';
                        // Trigger change event to show/hide rejection reason
                        statusSelect.dispatchEvent(new Event('change'));
                    }
                    if (rejectionReason && registration.rejectionReason) {
                        rejectionReason.value = registration.rejectionReason;
                    }
                    statusModal.show();
                }
            });
        });

        // Render pagination
        renderPagination(totalPages, filteredRegistrations.length);
    }

    // Render pagination controls
    function renderPagination(totalPages, totalItems) {
        if (!paginationContainer) return;

        if (totalPages <= 1) {
            paginationContainer.innerHTML = '';
            return;
        }

        let paginationHTML = `
            <nav aria-label="Page navigation">
                <ul class="pagination justify-content-center">
                    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                        <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
                    </li>
        `;

        // Show page numbers (with ellipsis for many pages)
        const maxVisiblePages = 5;
        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        if (startPage > 1) {
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" data-page="1">1</a></li>`;
            if (startPage > 2) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <li class="page-item ${currentPage === i ? 'active' : ''}">
                    <a class="page-link" href="#" data-page="${i}">${i}</a>
                </li>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHTML += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a></li>`;
        }

        paginationHTML += `
                    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                        <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
                    </li>
                </ul>
            </nav>
            <div class="text-center text-muted small mt-2">
                Showing ${((currentPage - 1) * itemsPerPage) + 1} to ${Math.min(currentPage * itemsPerPage, totalItems)} of ${totalItems} registrations
            </div>
        `;

        paginationContainer.innerHTML = paginationHTML;

        // Add click handlers to pagination links
        paginationContainer.querySelectorAll('.page-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = parseInt(e.currentTarget.dataset.page);
                if (page && page >= 1 && page <= totalPages) {
                    currentPage = page;
                    filterAndDisplayRegistrations();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            });
        });
    }

    // Update status
    async function updateStatus() {
        if (!currentRegistrationId) return;

        if (!statusSelect) return;

        const newStatus = statusSelect.value;
        const reason = rejectionReason?.value || '';

        try {
            const updateData = {
                status: newStatus,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (newStatus === 'rejected') {
                updateData.rejectionReason = reason;
            } else {
                updateData.rejectionReason = firebase.firestore.FieldValue.delete();
            }

            await db.collection('registrations').doc(currentRegistrationId).update(updateData);

            // Update local data
            const index = registrations.findIndex(r => r.id === currentRegistrationId);
            if (index !== -1) {
                registrations[index].status = newStatus;
                if (newStatus === 'rejected') {
                    registrations[index].rejectionReason = reason;
                } else {
                    delete registrations[index].rejectionReason;
                }
            }

            statusModal.hide();
            updateCounts();
            updateStats();
            filterAndDisplayRegistrations();

            showAlert('Status updated successfully!', 'success');

        } catch (error) {
            console.error('Error updating status:', error);
            showAlert('Failed to update status: ' + error.message, 'danger');
        }
    }

    // Show alert function
    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = 'alert';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        const container = document.querySelector('.container-fluid, .container');
        if (container) {
            container.prepend(alertDiv);

            // Auto-remove alert after 5 seconds
            setTimeout(() => {
                if (alertDiv.parentNode === container) {
                    container.removeChild(alertDiv);
                }
            }, 5000);
        }
    }

    // Expose loadRegistrations for export.js
    window.dashboardFunctions = {
        getRegistrations: () => registrations,
        getCurrentFilter: () => currentFilter
    };
});
