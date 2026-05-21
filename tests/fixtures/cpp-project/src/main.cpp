#include <cmath>

/// A simple function for testing
int add(int a, int b) {
    return a + b;
}

/// A class for testing
class Point {
public:
    int x;
    int y;

    Point(int x, int y) : x(x), y(y) {}

    double distance() const {
        return std::sqrt(x * x + y * y);
    }
};

int main() {
    Point p(3, 4);
    return add(p.x, p.y);
}
