"use client";

import React, { useEffect, useState } from 'react';
import HeroSection from '../components/HeroSection';
import FeaturedBooksSection from '../components/FeaturedBooksSection';
import CategoriesSection from '../components/CategoriesSection';
import BenefitsSection from '../components/BenefitsSection';
import NewsletterSection from '../components/NewsletterSection';
import AboutSection from '../components/AboutSection';
import Footer from '../components/Footer';

export default function Home() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <div>
      {/* Navigation */}
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`}>
          <div className="nav-logo">
              <h1>Bookie</h1>
          </div>
          <div className="nav-links">
              <a href="#home" className="active" onClick={(e) => {
                e.preventDefault();
                document.querySelector('#home')?.scrollIntoView({ behavior: 'smooth' });
              }}>Home</a>
              <a href="#explore" onClick={(e) => {
                e.preventDefault();
                document.querySelector('#explore')?.scrollIntoView({ behavior: 'smooth' });
              }}>Explore</a>
              <a href="#books" onClick={(e) => {
                e.preventDefault();
                document.querySelector('#books')?.scrollIntoView({ behavior: 'smooth' });
              }}>Books</a>
              <a href="#about" onClick={(e) => {
                e.preventDefault();
                document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
              }}>About</a>
          </div>
      </nav>

      <HeroSection />
      <FeaturedBooksSection />
      <CategoriesSection />
      <BenefitsSection />
      <NewsletterSection />
      <AboutSection />
      <Footer />
    </div>
  );
}
