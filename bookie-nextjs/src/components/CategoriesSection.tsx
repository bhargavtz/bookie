"use client";

import React, { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function CategoriesSection() {
  useEffect(() => {
    // Categories Section Animations
    gsap.from('.categories .section-header', {
        scrollTrigger: {
            trigger: '.categories',
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

    gsap.from('.category-card', {
        scrollTrigger: {
            trigger: '.categories .category-grid',
            start: 'top 80%',
            end: 'top 50%',
            scrub: 1,
            toggleActions: 'play none none none'
        },
        duration: 0.8,
        y: 30,
        opacity: 0,
        ease: 'power3.out',
        stagger: 0.15
    });

  }, []);

  return (
    <section className="categories" id="explore">
        <div className="section-header">
            <h2>Popular Categories</h2>
            <p>Explore our vast collection across different genres</p>
        </div>
        <div className="category-grid">
            <div className="category-card">
                <span className="category-icon">📖</span>
                <h3>Fiction</h3>
                <p>5,000+ Books</p>
            </div>
            <div className="category-card">
                <span className="category-icon">🎭</span>
                <h3>Drama</h3>
                <p>2,500+ Books</p>
            </div>
            <div className="category-card">
                <span className="category-icon">🔍</span>
                <h3>Mystery</h3>
                <p>3,000+ Books</p>
            </div>
            <div className="category-card">
                <span className="category-icon">🚀</span>
                <h3>Sci-Fi</h3>
                <p>2,000+ Books</p>
            </div>
        </div>
    </section>
  );
}
