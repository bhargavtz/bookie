"use client";

import React, { useEffect } from 'react';
import Image from 'next/image';
import { gsap } from 'gsap';

export default function HeroSection() {
  useEffect(() => {
    // Hero Animations
    gsap.from('.hero-badge', {
      duration: 1,
      y: -30,
      opacity: 0,
      ease: 'power3.out'
    });

    gsap.from('.hero-text h1', {
      duration: 1.2,
      y: 50,
      opacity: 0,
      ease: 'power3.out',
      delay: 0.3
    });

    gsap.from('.hero-text .purple', {
      duration: 1,
      color: '#1f2937', // Assuming this is the initial color before animation
      ease: 'power3.out',
      delay: 1
    });

    gsap.from('.hero-text p', {
      duration: 1,
      y: 30,
      opacity: 0,
      ease: 'power3.out',
      delay: 0.6
    });

    gsap.from('.hero-stats .stat-item', {
      duration: 0.8,
      y: 30,
      opacity: 0,
      ease: 'power3.out',
      stagger: 0.2,
      delay: 1.2
    });

    // Floating Books Animation (Placeholder for now, will need actual elements)
    gsap.to('.scroll-circle', {
      y: -10,
      duration: 1.5,
      ease: 'power1.inOut',
      yoyo: true,
      repeat: -1
    });

  }, []);

  return (
    <section className="hero" id="home">
        <div className="hero-content">
            <div className="hero-badge">
                <span>📚 Welcome to Bookie</span>
            </div>

            <div className="hero-text">
                <h1>
                    <span className="purple">Discover</span> Your<br/>
                    Next <span className="purple">Adventure</span>
                </h1>
                <p>Embark on a journey through countless stories,<br/>where every page opens a new world of<br/>imagination and discovery.</p>
            </div>

            <div className="hero-stats">
                <div className="stat-item">
                    <span className="stat-icon">📚</span>
                    <div className="stat-info">
                        <h3>10K+</h3>
                        <p>BOOKS</p>
                    </div>
                </div>
                <div className="stat-item">
                    <span className="stat-icon">👥</span>
                    <div className="stat-info">
                        <h3>50K+</h3>
                        <p>READERS</p>
                    </div>
                </div>
                <div className="stat-item">
                    <span className="stat-icon">⭐</span>
                    <div className="stat-info">
                        <h3>1M+</h3>
                        <p>DOWNLOADS</p>
                    </div>
                </div>
            </div>

            <div className="scroll-indicator">
                <div className="scroll-circle"></div>
                <p>Scroll to explore</p>
            </div>
        </div>

        <div className="hero-image">
            <Image src="/reading-book-illustration.jpg" alt="Reader with Books" className="main-image" width={500} height={500} priority />
        </div>
    </section>
  );
}
