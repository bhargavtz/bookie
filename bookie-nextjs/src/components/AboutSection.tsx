"use client";

import React, { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function AboutSection() {
  useEffect(() => {
    // About Section Animations
    gsap.from('.about-content h2', {
        scrollTrigger: {
            trigger: '.about',
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

    gsap.from('.about-content p', {
        scrollTrigger: {
            trigger: '.about',
            start: 'top 75%',
            end: 'top 45%',
            scrub: 1,
            toggleActions: 'play none none none'
        },
        duration: 1,
        y: 30,
        opacity: 0,
        ease: 'power3.out',
        delay: 0.2
    });

    gsap.from('.feature', {
        scrollTrigger: {
            trigger: '.about .features',
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
    <section className="about" id="about">
        <div className="about-content">
            <h2>About Bookie</h2>
            <p>Your digital reading companion that brings stories to life. Access thousands of books, connect with fellow readers, and embark on literary adventures.</p>
            <div className="features">
                <div className="feature">
                    <span>✨</span>
                    <h3>Easy Access</h3>
                    <p>Read on any device</p>
                </div>
                <div className="feature">
                    <span>🌟</span>
                    <h3>Large Collection</h3>
                    <p>Thousands of titles</p>
                </div>
                <div className="feature">
                    <span>💫</span>
                    <h3>Community</h3>
                    <p>Connect with readers</p>
                </div>
            </div>
        </div>
    </section>
  );
}
