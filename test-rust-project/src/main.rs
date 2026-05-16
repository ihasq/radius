// Test Rust project for LSP integration testing

const DEFAULT_NAME: &str = "World";
const MAX_COUNT: i32 = 10;

fn main() {
    let greeting = create_greeting(DEFAULT_NAME);
    println!("{}", greeting);

    let count = get_count();
    println!("Count: {}", count);
}

fn create_greeting(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn get_count() -> i32 {
    if MAX_COUNT > 5 {
        MAX_COUNT
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_greeting() {
        let result = create_greeting("Test");
        assert_eq!(result, "Hello, Test!");
    }
}
