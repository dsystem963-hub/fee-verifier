const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });

const supabaseUrl = process.env.SUPABASE_URL.trim();
const supabaseKey = process.env.SUPABASE_KEY.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDuplicates() {
    console.log('--- Cleaning Up Duplicate TIDs & Enforcing Uniqueness ---');
    
    // 1. Get all admissions
    const { data: admissions, error } = await supabase
        .from('admissions')
        .select('id, transaction_id, timestamp')
        .order('timestamp', { ascending: true });

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    const seenTids = new Set();
    const idsToDelete = [];

    admissions.forEach(a => {
        const cleanTid = a.transaction_id ? a.transaction_id.trim() : null;
        if (!cleanTid) return;

        if (seenTids.has(cleanTid)) {
            idsToDelete.push(a.id);
        } else {
            seenTids.add(cleanTid);
        }
    });

    if (idsToDelete.length > 0) {
        console.log(`Deleting ${idsToDelete.length} duplicate records...`);
        const { error: delError } = await supabase
            .from('admissions')
            .delete()
            .in('id', idsToDelete);
        
        if (delError) console.error('Delete error:', delError);
        else console.log('Duplicates deleted successfully.');
    } else {
        console.log('No duplicates found in existing data.');
    }

    console.log('\n--- IMPORTANT ---');
    console.log('To prevent this forever, please run this SQL in your Supabase SQL Editor:');
    console.log('ALTER TABLE admissions ADD CONSTRAINT unique_transaction_id UNIQUE (transaction_id);');
}

fixDuplicates();
