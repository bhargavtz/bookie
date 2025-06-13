"use client";

import React, { useState } from 'react';

export default function NewsletterSection() {
  const [email, setEmail] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (email) {
      // Add newsletter subscription logic here
      console.log('Newsletter subscription for:', email);
      setEmail('');
      alert('Thank you for subscribing!');
    }
  };

  return (
    <section className="newsletter">
        <div className="newsletter-content">
            <h2>Stay Updated</h2>
            <p>Subscribe to our newsletter for the latest book recommendations and reading tips</p>
            <form 
              className="newsletter-form" 
              onSubmit={handleSubmit}
              suppressHydrationWarning={true}
            >
                <input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  suppressHydrationWarning={true}
                />
                <button 
                  type="submit"
                  suppressHydrationWarning={true}
                >
                  Subscribe
                </button>
            </form>
        </div>
    </section>
  );
}
