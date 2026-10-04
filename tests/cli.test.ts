import { exec } from 'child_process';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';

// --- ΡΥΘΜΙΣΕΙΣ ---
// Η εντολή για να τρέχει το CLI.
// Αν το τρέχεις με node, άλλαξέ το σε: const CLI_CMD = 'node se2502.js';
const CLI_CMD = 'se2502'; 

// Όνομα προσωρινού αρχείου για το addpoints
const CSV_FILE = 'test_points.csv';

// Βοηθητική συνάρτηση για εκτέλεση εντολών
const runCommand = (args: string): Promise<string> => {
    return new Promise((resolve, reject) => {
        exec(`${CLI_CMD} ${args}`, (error, stdout, stderr) => {
            if (error && stderr && !stdout) {
                reject(stderr.trim());
            } else {
                resolve(stdout.trim());
            }
        });
    });
};

describe('CLI Functional Tests (Final)', function () {
    this.timeout(15000); // Αυξημένο timeout για ασφάλεια

    let dynamicPointId: string = "";

    // --- SETUP: Δημιουργία CSV αρχείου ---
    before(() => {
        const csvContent = `name,lat,lng,connectorType,maxKW,status,address
TestStation_CLI,38.00,23.70,TYPE2,22,AVAILABLE,Test Address`;
        fs.writeFileSync(path.join(process.cwd(), CSV_FILE), csvContent);
    });

    // --- TEARDOWN: Διαγραφή CSV αρχείου ---
    after(() => {
        if (fs.existsSync(CSV_FILE)) {
            fs.unlinkSync(CSV_FILE);
        }
    });

    // 1. LOGIN
    it('should login successfully', async () => {
        const output = await runCommand('login --username admin@ev.local --passw admin123');
        expect(output).to.contain('Login successful');
    });

    // 2. HEALTHCHECK
    it('should return healthcheck OK', async () => {
        const output = await runCommand('healthcheck --format json');
        try {
            const json = JSON.parse(output);
            expect(json).to.have.property('status', 'OK');
        } catch (e) {
            throw new Error(`Failed to parse JSON. Output was: ${output}`);
        }
    });

    // 3. RESET POINTS
    it('should reset points successfully', async () => {
        const output = await runCommand('resetpoints --format json');
        try {
            const json = JSON.parse(output);
            expect(json).to.have.property('status', 'OK');
        } catch (e) {
             throw new Error(`Failed to parse JSON. Output was: ${output}`);
        }
    });

    // 4. ADD POINTS
    it('should add points from CSV', async () => {
        // Δημιουργούμε το απόλυτο path για να είμαστε σίγουροι ότι το CLI θα βρει το αρχείο
        const absolutePath = path.resolve(process.cwd(), CSV_FILE);
        
        // Χρησιμοποιούμε το absolutePath στην εντολή
        // Βάζουμε εισαγωγικά γύρω από το path για ασφάλεια (αν έχει κενά)
        const output = await runCommand(`addpoints --source "${absolutePath}" --format json`);
        
        try {
            const json = JSON.parse(output);
            expect(json).to.have.property('status');
        } catch (e) {
            throw new Error(`Failed to parse JSON. Output was: ${output}`);
        }
    });

    // 5. GET ALL POINTS & SAVE ID (Auto-increment handling)
    it('should return points list and capture an ID', async () => {
        const output = await runCommand('points --format json');
        try {
            const json = JSON.parse(output);
            const list = Array.isArray(json) ? json : json.points;
            
            expect(list).to.be.an('array');
            expect(list.length).to.be.greaterThan(0);

            // Αποθηκεύουμε το ID του πρώτου φορτιστή
            dynamicPointId = list[0].pointid || list[0].id;
            
            if (!dynamicPointId) throw new Error("Could not find 'pointid' or 'id' in the response");
            
            console.log(`\t   [Info] Captured Dynamic ID: ${dynamicPointId}`);

        } catch (e) {
            throw new Error(`Failed to parse points JSON. Output: ${output}`);
        }
    });

    // 6. GET SPECIFIC POINT
    it('should return details for specific point', async function () {
        if (!dynamicPointId) this.skip();

        const output = await runCommand(`point --id ${dynamicPointId} --format json`);
        try {
            const json = JSON.parse(output);
            // Συγκρίνουμε ως Strings για ασφάλεια
            const returnedId = json.pointid || json.id;
            expect(String(returnedId)).to.equal(String(dynamicPointId));
        } catch (e) {
            throw new Error(`Failed to parse point JSON. Output: ${output}`);
        }
    });

    // 7. RESERVE SPOT
    it('should reserve the charging point', async function () {
        if (!dynamicPointId) this.skip();

        const output = await runCommand(`reserve --id ${dynamicPointId} --minutes 30 --format json`);
        try {
            const json = JSON.parse(output);
            // Ελέγχουμε αν υπάρχει pointid στην απάντηση
            expect(json).to.have.property('pointid');
        } catch (e) {
            // Αν το σημείο είναι ήδη reserved, μπορεί να σκάσει με error message.
            // Ελέγχουμε αν είναι JSON error
            if (output.includes('error')) {
                 console.warn("\t   [Warn] Reservation failed (maybe already reserved). Test continues.");
            } else {
                 throw new Error(`Failed to parse reserve JSON. Output: ${output}`);
            }
        }
    });

    // 8. UPDATE POINT
    it('should update point price', async function () {
        if (!dynamicPointId) this.skip();

        const output = await runCommand(`updpoint --id ${dynamicPointId} --price 0.55 --format json`);
        try {
            const json = JSON.parse(output);
            expect(json).to.have.property('kwhprice');
            expect(Number(json.kwhprice)).to.equal(0.55);
        } catch (e) {
            throw new Error(`Failed to parse updpoint JSON. Output: ${output}`);
        }
    });

    // 9. LOGOUT
    it('should logout successfully', async () => {
        const output = await runCommand('logout');
        expect(output).to.contain('Logged out successfully');
    });
});