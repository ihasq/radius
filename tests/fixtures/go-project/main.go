package main

import (
	"fmt"
	"math"
)

// Add returns the sum of two integers
func Add(a, b int) int {
	return a + b
}

// Point represents a 2D point
type Point struct {
	X int
	Y int
}

// NewPoint creates a new Point
func NewPoint(x, y int) *Point {
	return &Point{X: x, Y: y}
}

// Distance calculates the distance from origin
func (p *Point) Distance() float64 {
	return math.Sqrt(float64(p.X*p.X + p.Y*p.Y))
}

func main() {
	p := NewPoint(3, 4)
	fmt.Printf("Distance: %f\n", p.Distance())
	fmt.Printf("Sum: %d\n", Add(p.X, p.Y))
}
