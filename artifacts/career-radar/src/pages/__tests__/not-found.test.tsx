import { render } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import NotFound from '../not-found'

// Mock lucide-react to avoid SVG rendering issues in jsdom
vi.mock('lucide-react', () => ({
  AlertCircle: () => null,
}))

// Mock shadcn/ui components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}))

describe('NotFound Page', () => {
  it('renders the 404 heading', () => {
    const { container } = render(<NotFound />)
    expect(container.textContent).toContain('404 Page Not Found')
  })

  it('renders the helpful message', () => {
    const { container } = render(<NotFound />)
    expect(container.textContent).toContain('Did you forget to add the page to the router')
  })
})
