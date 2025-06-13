"use client";

import React, { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/dist/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export default function BenefitsSection() {
  useEffect(() => {
    // Benefits Section Animations
    gsap.from('.benefits .section-header', {
        scrollTrigger: {
            trigger: '.benefits',
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

    gsap.from('.benefit-card', {
        scrollTrigger: {
            trigger: '.benefits .benefits-grid',
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
    <section className="benefits">
        <div className="section-header">
            <h2>Why Reading Matters</h2>
            <p>Discover the transformative power of reading</p>
        </div>
        <div className="benefits-grid">
            <div className="benefit-card">
                <span className="benefit-icon">🧠</span>
                <h3>Cognitive Growth</h3>
                <p>Enhance memory and critical thinking skills</p>
            </div>
            <div className="benefit-card">
                <span className="benefit-icon">💭</span>
                <h3>Stress Relief</h3>
                <p>Escape into stories and reduce anxiety</p>
            </div>
            <div className="benefit-card">
                <span className="benefit-icon">📚</span>
                <h3>Knowledge</h3>
                <p>Expand your understanding of the world</p>
            </div>
            <div className="benefit-card">
                <span className="benefit-icon">💡</span>
                <h3>Creativity</h3>
                <p>Stimulate imagination and innovation</p>
            </div>
        </div>
    </section>
  );
}
