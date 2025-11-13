document.addEventListener('DOMContentLoaded', () => {
    // ---- Sidebar Toggle for Mobile ----
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle'); // Tombol di luar sidebar
    const mobileSidebarToggle = document.getElementById('mobileSidebarToggle'); // Tombol di header mobile
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    const toggleSidebar = () => {
        sidebar.classList.toggle('-translate-x-full');
        sidebarOverlay.classList.toggle('hidden');
    };

    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
    }
    if (mobileSidebarToggle) { // Pastikan tombol ini ada di header mobile
      mobileSidebarToggle.addEventListener('click', toggleSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', toggleSidebar); // Menutup sidebar saat klik overlay
    }


    // ---- Menu Dropdown Toggle ----
    const menuDropdownToggle = document.getElementById('menuDropdownToggle');
    const menuDropdownContent = document.getElementById('menuDropdownContent');
    const menuDropdownArrow = document.getElementById('menuDropdownArrow');

    if (menuDropdownToggle && menuDropdownContent && menuDropdownArrow) {
        menuDropdownToggle.addEventListener('click', () => {
            menuDropdownContent.classList.toggle('hidden');
            menuDropdownArrow.classList.toggle('rotate-180'); // Memutar panah saat terbuka
        });
    }

    // ---- Modal Add to Cart Logic (Sama seperti sebelumnya) ----
    const quantityModal = document.getElementById('quantityModal');
    const closeQuantityModalBtn = document.getElementById('closeQuantityModal');
    const addToCartButtons = document.querySelectorAll('.add-to-cart-btn');

    const modalMenuId = document.getElementById('modal-menu-id');
    const modalMenuName = document.getElementById('modal-menu-name');
    const modalMenuPriceDisplay = document.getElementById('modal-menu-price-display');
    const modalMenuImage = document.getElementById('modal-menu-image');
    const modalQuantityInput = document.getElementById('modal-quantity');
    const modalTotalDisplay = document.getElementById('modal-total-display');
    const decreaseQuantityBtn = document.getElementById('decreaseQuantity');
    const increaseQuantityBtn = document.getElementById('increaseQuantity');

    let currentItemPrice = 0; // Menyimpan harga item yang sedang dipilih

    // Helper: Fungsi untuk format mata uang
    function formatCurrency(amount) {
      return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0
      }).format(amount);
    }

    // Fungsi untuk mengupdate total harga di modal
    const updateModalTotal = () => {
      const quantity = parseInt(modalQuantityInput.value) || 0;
      const total = quantity * currentItemPrice;
      modalTotalDisplay.textContent = formatCurrency(total);
      decreaseQuantityBtn.disabled = quantity <= 1;
    };

    // Fungsi utama untuk membuka modal
    const openModal = (menu) => {
      currentItemPrice = parseFloat(menu.price); // Pastikan ini angka float
      
      modalMenuId.value = menu.id;
      modalMenuName.textContent = menu.name;
      modalMenuPriceDisplay.textContent = formatCurrency(menu.price);
      modalMenuImage.src = menu.image || 'https://placehold.co/80'; // Fallback image
      modalQuantityInput.value = 1; // Reset kuantitas ke 1
      
      updateModalTotal(); // Hitung total awal
      quantityModal.classList.remove('hidden');
    };

    // Event listener untuk tombol 'Tambah ke Keranjang'
    if (addToCartButtons.length > 0) { // Hanya jalankan jika tombol ada
      addToCartButtons.forEach(button => {
        button.addEventListener('click', (event) => {
          const menu = {
            id: button.dataset.menuId,
            name: button.dataset.menuName,
            price: button.dataset.menuPrice,
            image: button.dataset.menuImage
          };
          openModal(menu);
        });
      });
    }

    // Event listeners untuk tombol +/-
    if (decreaseQuantityBtn && increaseQuantityBtn) {
      decreaseQuantityBtn.addEventListener('click', () => {
        let quantity = parseInt(modalQuantityInput.value);
        if (quantity > 1) {
          modalQuantityInput.value = quantity - 1;
          updateModalTotal();
        }
      });
      increaseQuantityBtn.addEventListener('click', () => {
        let quantity = parseInt(modalQuantityInput.value);
        modalQuantityInput.value = quantity + 1;
        updateModalTotal();
      });
    }

    // Event listener untuk input kuantitas dan tutup modal
    if (modalQuantityInput) {
      modalQuantityInput.addEventListener('input', updateModalTotal);
    }
    if (closeQuantityModalBtn) {
      closeQuantityModalBtn.addEventListener('click', () => quantityModal.classList.add('hidden'));
    }
    if (quantityModal) {
      quantityModal.addEventListener('click', (e) => {
        if (e.target === quantityModal) {
          quantityModal.classList.add('hidden');
        }
      });
    }
});