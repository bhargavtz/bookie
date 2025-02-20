// Navbar Scroll Effect
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(255, 255, 255, 0.98)';
    } else {
        navbar.style.background = 'rgba(255, 255, 255, 0.95)';
    }
});

// Search Functionality
const searchInput = document.querySelector('.nav-search input');
searchInput.addEventListener('input', (e) => {
    // Add live search suggestions here
    console.log('Searching for:', e.target.value);
});

// Book Carousel
const bookData = [
    {
        title: 'The Lost City',
        author: 'John Smith',
        cover: 'https://via.placeholder.com/200x300',
        rating: 4
    },
    {
        title: 'Mystery of the Deep',
        author: 'Sarah Johnson',
        cover: 'https://via.placeholder.com/200x300',
        rating: 5
    },
    {
        title: 'The Last Dragon',
        author: 'Michael Brown',
        cover: 'https://via.placeholder.com/200x300',
        rating: 4
    },
    {
        title: 'Eternal Love',
        author: 'Emily Wilson',
        cover: 'https://via.placeholder.com/200x300',
        rating: 5
    }
];

function createBookCard(book) {
    return `
        <div class="book-card">
            <div class="book-cover">
                <img src="${book.cover}" alt="${book.title}">
            </div>
            <h3>${book.title}</h3>
            <p>By ${book.author}</p>
            <div class="rating">${'★'.repeat(book.rating)}${'☆'.repeat(5-book.rating)}</div>
        </div>
    `;
}

const bookCarousel = document.querySelector('.book-carousel');
bookData.forEach(book => {
    bookCarousel.innerHTML += createBookCard(book);
});

// Enhanced Hero Animations
gsap.from('.hero-badge', {
    duration: 1,
    y: -30,
    opacity: 0,
    ease: 'power3.out'
});

gsap.from('.hero-title', {
    duration: 1.2,
    y: 50,
    opacity: 0,
    ease: 'power3.out',
    delay: 0.3
});

gsap.from('.hero-title .highlight', {
    duration: 1,
    color: '#1f2937',
    ease: 'power3.out',
    delay: 1
});

gsap.from('.hero-title .text-gradient', {
    duration: 1,
    opacity: 0.5,
    ease: 'power3.out',
    delay: 1.2
});

gsap.from('.hero-subtitle', {
    duration: 1,
    y: 30,
    opacity: 0,
    ease: 'power3.out',
    delay: 0.6
});

gsap.from('.hero-buttons .cta-button', {
    duration: 0.8,
    scale: 0.8,
    opacity: 0,
    ease: 'back.out(1.7)',
    stagger: 0.2,
    delay: 0.9
});

gsap.from('.stat-item', {
    duration: 0.8,
    y: 30,
    opacity: 0,
    ease: 'power3.out',
    stagger: 0.2,
    delay: 1.2
});

// Floating Books Animation
gsap.to('.book1', {
    y: -20,
    rotation: 3,
    duration: 2,
    ease: 'power1.inOut',
    yoyo: true,
    repeat: -1
});

gsap.to('.book2', {
    y: -15,
    rotation: -2,
    duration: 2.5,
    ease: 'power1.inOut',
    yoyo: true,
    repeat: -1,
    delay: 0.2
});

gsap.to('.book3', {
    y: -10,
    rotation: 2,
    duration: 3,
    ease: 'power1.inOut',
    yoyo: true,
    repeat: -1,
    delay: 0.4
});

// Mouse Hover Effect on Books
const books = document.querySelectorAll('.floating-book');
books.forEach(book => {
    book.addEventListener('mouseenter', () => {
        gsap.to(book, {
            scale: 1.05,
            rotation: 0,
            duration: 0.3,
            ease: 'power2.out',
            zIndex: 10
        });
    });
    
    book.addEventListener('mouseleave', () => {
        gsap.to(book, {
            scale: 1,
            rotation: book.classList.contains('book1') ? 5 : 
                      book.classList.contains('book2') ? -5 : 3,
            duration: 0.3,
            ease: 'power2.out',
            zIndex: book.classList.contains('book1') ? 3 :
                   book.classList.contains('book2') ? 2 : 1
        });
    });
});

// Parallax Effect on Hero Section
window.addEventListener('mousemove', (e) => {
    const mouseX = e.clientX / window.innerWidth - 0.5;
    const mouseY = e.clientY / window.innerHeight - 0.5;

    gsap.to('.floating-books', {
        duration: 1,
        x: mouseX * 30,
        y: mouseY * 30,
        rotationY: mouseX * 10,
        rotationX: -mouseY * 10,
        ease: 'power2.out'
    });
});

// Scroll Animations
const scrollElements = document.querySelectorAll('.book-card, .genre-card, .feature-card');

const elementInView = (el, percentageScroll = 100) => {
    const elementTop = el.getBoundingClientRect().top;
    return (
        elementTop <= 
        ((window.innerHeight || document.documentElement.clientHeight) * (percentageScroll/100))
    );
};

const displayScrollElement = (element) => {
    element.classList.add('scrolled');
};

const hideScrollElement = (element) => {
    element.classList.remove('scrolled');
};

const handleScrollAnimation = () => {
    scrollElements.forEach((el) => {
        if (elementInView(el, 100)) {
            displayScrollElement(el);
        } else {
            hideScrollElement(el);
        }
    });
};

window.addEventListener('scroll', () => {
    handleScrollAnimation();
});

// Newsletter Form
const newsletterForm = document.querySelector('.newsletter-form');
newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = newsletterForm.querySelector('input').value;
    if (email) {
        // Add newsletter subscription logic here
        console.log('Newsletter subscription for:', email);
        newsletterForm.querySelector('input').value = '';
        alert('Thank you for subscribing!');
    }
});

// Mobile Menu Toggle
const createMobileMenu = () => {
    const navbar = document.querySelector('.navbar');
    const navLinks = document.querySelector('.nav-links');
    
    const menuButton = document.createElement('button');
    menuButton.classList.add('mobile-menu-btn');
    menuButton.innerHTML = '☰';
    
    navbar.insertBefore(menuButton, navLinks);
    
    menuButton.addEventListener('click', () => {
        navLinks.classList.toggle('show');
    });
};

if (window.innerWidth <= 768) {
    createMobileMenu();
}

// Book Card Hover Effect
const bookCards = document.querySelectorAll('.book-card');
bookCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        gsap.to(card, {
            duration: 0.3,
            y: -10,
            ease: 'power2.out'
        });
    });
    
    card.addEventListener('mouseleave', () => {
        gsap.to(card, {
            duration: 0.3,
            y: 0,
            ease: 'power2.out'
        });
    });
});

// Featured Section Animations
const featuredSection = document.querySelector('.featured');
const featuredObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            // Animate text content
            gsap.from('.featured-text h2', {
                duration: 1,
                y: 50,
                opacity: 0,
                ease: 'power3.out'
            });

            gsap.from('.featured-text p', {
                duration: 1,
                y: 30,
                opacity: 0,
                ease: 'power3.out',
                delay: 0.2
            });

            gsap.from('.featured-list li', {
                duration: 0.8,
                x: -30,
                opacity: 0,
                ease: 'power3.out',
                stagger: 0.1,
                delay: 0.4
            });

            gsap.from('.featured-button', {
                duration: 0.8,
                y: 20,
                opacity: 0,
                ease: 'power3.out',
                delay: 0.8
            });

            // Animate image
            gsap.from('.reading-image', {
                duration: 1.2,
                x: 100,
                opacity: 0,
                ease: 'power3.out',
                delay: 0.2
            });

            featuredObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.2 });

featuredObserver.observe(featuredSection);

// Stats Section Animations
const statsSection = document.querySelector('.stats-section');
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            gsap.from('.stats-grid', {
                duration: 1,
                y: 50,
                opacity: 0,
                ease: 'power3.out'
            });

            gsap.from('.stat-item', {
                duration: 0.8,
                scale: 0.8,
                opacity: 0,
                ease: 'back.out(1.7)',
                stagger: 0.2
            });

            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.2 });

statsObserver.observe(statsSection);

// Benefits Section Animations
const benefitsSection = document.querySelector('.benefits-section');
const benefitsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            gsap.from('.benefits-text h2', {
                duration: 1,
                y: 50,
                opacity: 0,
                ease: 'power3.out'
            });

            gsap.from('.benefits-img', {
                duration: 1.2,
                x: -100,
                opacity: 0,
                ease: 'power3.out',
                delay: 0.2
            });

            gsap.from('.benefit-card', {
                duration: 0.8,
                y: 30,
                opacity: 0,
                ease: 'power3.out',
                stagger: 0.15,
                delay: 0.4
            });

            benefitsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.2 });

benefitsObserver.observe(benefitsSection);

// Parallax Effect for Stats Section
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const statsSection = document.querySelector('.stats-section');
    const statsRect = statsSection.getBoundingClientRect();
    
    if (statsRect.top < window.innerHeight && statsRect.bottom > 0) {
        statsSection.style.backgroundPositionY = `${scrolled * 0.5}px`;
    }
}); 