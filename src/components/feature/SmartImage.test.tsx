import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartImage from './SmartImage';

describe('SmartImage', () => {
  it('renders a real photo as an <img> with lazy loading and alt', () => {
    render(<SmartImage src="https://cdn.example/photo.jpg" alt="2 BHK in Gachibowli" />);
    const img = screen.getByAltText('2 BHK in Gachibowli') as HTMLImageElement;
    expect(img.tagName).toBe('IMG');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.src).toContain('photo.jpg');
  });

  it('honours eager loading for above-the-fold images', () => {
    render(<SmartImage src="https://cdn.example/photo.jpg" alt="hero" eager />);
    expect((screen.getByAltText('hero') as HTMLImageElement).getAttribute('loading')).toBe('eager');
  });

  it('shows the designed empty state (not a broken glyph) when src is missing', () => {
    render(<SmartImage src={null} alt="No photo listing" />);
    const box = screen.getByRole('img', { name: 'No photo listing' });
    expect(box.tagName).toBe('DIV');
    expect(screen.queryByRole('img', { name: 'No photo listing' })?.querySelector('img')).toBeNull();
  });

  it('treats a /placeholders/ path as "no real photo"', () => {
    render(<SmartImage src="/placeholders/photo.svg" alt="placeholder listing" />);
    expect(screen.getByRole('img', { name: 'placeholder listing' }).tagName).toBe('DIV');
  });

  it('falls back to the empty state when the real image fails to load', () => {
    render(<SmartImage src="https://cdn.example/broken.jpg" alt="broken listing" />);
    const img = screen.getByAltText('broken listing');
    expect(img.tagName).toBe('IMG');
    fireEvent.error(img);
    // After the error the same alt is now an aria-labelled div, not an <img>.
    expect(screen.getByRole('img', { name: 'broken listing' }).tagName).toBe('DIV');
  });

  it('fires onClick from both the image and the empty state', () => {
    let clicks = 0;
    const onClick = () => { clicks++; };
    const { rerender } = render(<SmartImage src="https://cdn.example/photo.jpg" alt="clickable" onClick={onClick} />);
    fireEvent.click(screen.getByAltText('clickable'));
    rerender(<SmartImage src={null} alt="clickable" onClick={onClick} />);
    fireEvent.click(screen.getByRole('img', { name: 'clickable' }));
    expect(clicks).toBe(2);
  });
});
