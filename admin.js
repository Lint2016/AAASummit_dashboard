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

            // Fetch all documents
            const querySnapshot = await db.collection('registrations').get();

            // 1. Map documents with robust timestamp parsing
            let rawRegistrations = querySnapshot.docs.map(doc => {
                const data = doc.data();

                // Robust Timestamp Parsing logic
                const getRobustTimestamp = (data) => {
                    // Check multiple common field names
                    const fields = ['submissionTime', 'timestamp', 'createdAt', 'created_at', 'date'];
                    for (const field of fields) {
                        const val = data[field];
                        if (val === undefined || val === null) continue;

                        // Firestore Timestamp Object
                        if (val.toMillis && typeof val.toMillis === 'function') return val.toMillis();
                        if (val._seconds) return val._seconds * 1000 + Math.floor((val._nanoseconds || 0) / 1000000);

                        // Date Object
                        if (val instanceof Date) return val.getTime();

                        // String or Number representation
                        const num = Number(val);
                        if (!isNaN(num) && num > 1000000000) return num; // Basic check for epoch range

                        const ms = Date.parse(val);
                        if (!isNaN(ms)) return ms;
                    }
                    return 0; // Fallback to 0 (bottom of list) instead of Date.now()
                };

                const timestamp = getRobustTimestamp(data);
                if (timestamp === 0) {
                    console.warn(`Record ${doc.id} missing valid timestamp. Falling back to 0.`, data);
                }

                // Return with safe defaults
                return {
                    id: doc.id,
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: (data.email || '').toLowerCase().trim(),
                    phone: data.phone || '',
                    country: data.country || '',
                    dietary: data.dietary || '',
                    status: data.status || 'pending',
                    submissionTime: timestamp,
                    rejectionReason: data.rejectionReason || null,
                    hasDuplicates: false
                };
            });

            // 2. Initial Sort (newest first)
            rawRegistrations.sort((a, b) => b.submissionTime - a.submissionTime);

            // 3. Deduplication & History Logic
            // Group by email, keeping the latest one as primary and others in .history
            const emailMap = new Map();
            const uniqueRegistrations = [];

            rawRegistrations.forEach(reg => {
                const email = reg.email;
                if (!email) {
                    uniqueRegistrations.push({ ...reg, history: [] });
                    return;
                }

                if (!emailMap.has(email)) {
                    const primary = { ...reg, history: [] };
                    emailMap.set(email, primary);
                    uniqueRegistrations.push(primary);
                } else {
                    // Add this older entry to the primary's history
                    emailMap.get(email).hasDuplicates = true;
                    emailMap.get(email).history.push(reg);
                }
            });

            registrations = uniqueRegistrations;

            console.log(`Summary: ${registrations.length} unique records, history attached to duplicates.`);
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

    // Format timestamp helper
    function formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
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
        table.className = 'table table-hover align-middle';
        table.innerHTML = `
            <thead>
                <tr>
                    <th style="width: 40px"></th>
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

            const submissionDateStr = formatTime(reg.submissionTime);

            // Main Row
            const row = document.createElement('tr');
            row.className = reg.hasDuplicates ? 'has-history' : '';

            const toggleBtn = reg.hasDuplicates ?
                `<button class="btn btn-sm btn-link text-primary p-0 toggle-history" data-target="history-${reg.id}">
                    <i class="bi bi-chevron-right"></i>
                 </button>` : '';

            const duplicateBadge = reg.hasDuplicates ?
                `<span class="badge rounded-pill bg-light text-primary border ms-1" title="${reg.history.length} previous submissions detected">
                    +${reg.history.length}
                </span>` : '';

            row.innerHTML = `
                <td>${toggleBtn}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <span>${reg.firstName} ${reg.lastName}</span>
                        ${duplicateBadge}
                    </div>
                </td>
                <td>${reg.email}</td>
                <td class="hide-on-tablet">${reg.phone}</td>
                <td class="hide-on-tablet">${reg.country}</td>
                <td><span class="badge bg-${statusClass}">${reg.status}</span></td>
                <td>${submissionDateStr}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary edit-status" data-id="${reg.id}" title="Update Status">
                        <i class="bi bi-pencil-square"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn-row ms-1" data-id="${reg.id}" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);

            // Expandable History Row
            if (reg.hasDuplicates) {
                const historyRow = document.createElement('tr');
                historyRow.id = `history-${reg.id}`;
                historyRow.className = 'history-row d-none bg-light';

                let historyHTML = `
                    <td colspan="8" class="p-0">
                        <div class="p-3 ps-5 border-start border-primary border-4">
                            <h6 class="text-muted mb-2 small fw-bold">SUBMISSION HISTORY</h6>
                            <table class="table table-sm table-borderless mb-0 small">
                                <thead>
                                    <tr class="text-muted">
                                        <th>Submitted On</th>
                                        <th>Status</th>
                                        <th>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;

                reg.history.forEach(h => {
                    const hStatusClass = {
                        pending: 'warning',
                        approved: 'success',
                        rejected: 'danger'
                    }[h.status] || 'secondary';

                    historyHTML += `
                        <tr>
                            <td class="text-dark">${formatTime(h.submissionTime)}</td>
                            <td><span class="badge bg-${hStatusClass} opacity-75">${h.status}</span></td>
                            <td class="text-muted italic">${h.dietary ? 'Dietary: ' + h.dietary : 'No special notes'}</td>
                        </tr>
                    `;
                });

                historyHTML += `
                                </tbody>
                            </table>
                        </div>
                    </td>
                `;
                historyRow.innerHTML = historyHTML;
                tbody.appendChild(historyRow);
            }
        });

        registrationsList.appendChild(table);

        // Add event listeners for toggle buttons
        document.querySelectorAll('.toggle-history').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = e.currentTarget.dataset.target;
                const targetRow = document.getElementById(targetId);
                const icon = e.currentTarget.querySelector('i');

                if (targetRow) {
                    const isHidden = targetRow.classList.contains('d-none');
                    if (isHidden) {
                        targetRow.classList.remove('d-none');
                        icon.className = 'bi bi-chevron-down';
                        e.currentTarget.closest('tr').classList.add('expanded');
                    } else {
                        targetRow.classList.add('d-none');
                        icon.className = 'bi bi-chevron-right';
                        e.currentTarget.closest('tr').classList.remove('expanded');
                    }
                }
            });
        });

        // Add event listeners for delete buttons (quick action)
        document.querySelectorAll('.delete-btn-row').forEach(btn => {
            btn.addEventListener('click', (e) => {
                currentRegistrationId = e.currentTarget.dataset.id;
                deleteConfirmModal.show();
            });
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
