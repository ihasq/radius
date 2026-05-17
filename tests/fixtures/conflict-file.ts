export const config = {
  version: "1.0",
<<<<<<< HEAD
  port: 3000,
  host: "localhost",
=======
  port: 8080,
  host: "0.0.0.0",
>>>>>>> feature/new-config
};

function processRequest(data: string): void {
<<<<<<< HEAD
||||||| base
  console.log("Processing:", data);
  validate(data);
=======
  console.log("Processing request:", data);
  validateInput(data);
>>>>>>> feature/validation
  // Continue processing
}
