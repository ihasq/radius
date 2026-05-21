const std = @import("std");

/// A simple function for testing
pub fn add(a: i32, b: i32) i32 {
    return a + b;
}

/// A struct for testing
pub const Point = struct {
    x: i32,
    y: i32,

    pub fn new(x: i32, y: i32) Point {
        return Point{ .x = x, .y = y };
    }

    pub fn distance(self: Point) f64 {
        const x_sq = @as(f64, @floatFromInt(self.x * self.x));
        const y_sq = @as(f64, @floatFromInt(self.y * self.y));
        return @sqrt(x_sq + y_sq);
    }
};

test "basic add" {
    try std.testing.expectEqual(@as(i32, 5), add(2, 3));
}
