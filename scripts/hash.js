import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';

function calculateFileHash(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const input = fs.createReadStream(filePath);

        input.on('error', reject);
        hash.on('readable', () => {
            const data = hash.read();
            if (data) {
                resolve(data.toString('hex'));
            }
        });

        input.pipe(hash);
    });
}
// function calculateFileHash(filePath) {
//     return new Promise((resolve, reject) => {
//         const hash = crypto.createHash("sha256");
//         const stream = fs.createReadStream(filePath);

//         stream.on("data", (data) => {
//             hash.update(data);
//         });

//         stream.on("end", () => {
//             resolve(hash.digest("hex"));
//         });

//         stream.on("error", (error) => {
//             reject(error);
//         });
//     });
// }

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Prompt user to drag and drop a file
console.log('Please drag and drop a file into the terminal, then press Enter:');
rl.question('', (filePath) => {
    // Clean the file path (remove quotes and spaces that might be added when dragging)
    filePath = filePath.trim().replace(/^['"]|['"]$/g, '');

    console.log(`Calculating hash for: ${filePath}`);
    calculateFileHash(filePath)
        .then((hash) => {
            console.log(`SHA-256 Hash: ${hash}`);
            rl.close();
        })
        .catch((error) => {
            console.error(`Error calculating hash: ${error.message}`);
            rl.close();
        });
});
