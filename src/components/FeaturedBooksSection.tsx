"use client";

import React, { useEffect } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function FeaturedBooksSection() {
  useEffect(() => {
    // Featured Section Animations
    gsap.from('.featured-books h2', {
        scrollTrigger: {
            trigger: '.featured-books',
            start: 'top 80%',
            end: 'top 50%',
            scrub: 1,
            toggleActions: 'play none none none'
        },
        duration: 1,
        y: 50,
        opacity: 0,
        ease: 'power3.out'
    });

    gsap.from('.book-card', {
        scrollTrigger: {
            trigger: '.featured-books .book-grid',
            start: 'top 80%',
            end: 'top 50%',
            scrub: 1,
            toggleActions: 'play none none none'
        },
        duration: 0.8,
        y: 30,
        opacity: 0,
        ease: 'power3.out',
        stagger: 0.2
    });

  }, []);

  return (
    <section className="featured-books" id="books">
        <h2>Featured Books</h2>
        <div className="book-grid">
            <div className="book-card">
                <Image src="/7117804_3529668.jpg" alt="Book 1" width={200} height={300} />
                <h3>The Art of Reading</h3>
                <p>Discover the joy of literature</p>
            </div>
            <div className="book-card">
                <Image src="/na_feb_36.jpg" alt="Book 2" width={200} height={300} />
                <h3>Modern Classics</h3>
                <p>Contemporary masterpieces</p>
            </div>
            <div className="book-card">
                <Image src="/27669009_reading_05.jpg" alt="Book 3" width={200} height={300} />
                <h3>Digital Library</h3>
                <p>Read anywhere, anytime</p>
            </div>
        </div>
    </section>
  );
}
