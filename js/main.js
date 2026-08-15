document.querySelectorAll('.dropdown').forEach(dropdown => {
    // Listen for finger taps/clicks on the dropdown element
    dropdown.addEventListener('click', (e) => {
        // If the user is on a mobile touch screen, run the toggle logic
        if (window.matchMedia('(pointer: coarse)').matches) {
            e.stopPropagation(); // Stops the page from instantly closing the menu
            dropdown.classList.toggle('open'); // Toggles the menu open/closed
        }
    });
});

// Close any open mobile submenus if the user taps anywhere else on the screen
document.addEventListener('click', () => {
    document.querySelectorAll('.dropdown').forEach(dropdown => {
        dropdown.classList.remove('open');
    });
});


