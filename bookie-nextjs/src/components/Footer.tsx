"use client";

import React from 'react';

export default function Footer() {
  return (
    <footer>
        <div className="footer-content">
            <div className="footer-section">
                <h3>Bookie</h3>
                <p>Your digital reading paradise</p>
            </div>
            <div className="footer-section">
                <h3>Links</h3>
                <a href="#home" onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#home')?.scrollIntoView({ behavior: 'smooth' });
                }}>Home</a>
                <a href="#books" onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#books')?.scrollIntoView({ behavior: 'smooth' });
                }}>Books</a>
                <a href="#about" onClick={(e) => {
                  e.preventDefault();
                  document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' });
                }}>About</a>
            </div>
            <div className="footer-section">
                <h3>Contact</h3>
                <p>hello@bookie.com</p>
            </div>
        </div>
        <div className="footer-bottom">
            <p>&copy; 2024 Bookie. All rights reserved.</p>
            <p>Made by Bhargavtz <a href="https://github.com/Bhargavtz">Github</a></p>
        </div>
    </footer>
  );
}
