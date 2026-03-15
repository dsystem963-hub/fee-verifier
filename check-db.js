const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });

const supabaseUrl = process.env.SUPABASE_URL.trim();
const supabaseKey = process.env.SUPABASE_KEY.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
    console.log('--- Checking for Duplicate TIDs ---');
    const { data: admissions, error } = await supabase
        .from('admissions')
        .select('id, full_name, transaction_id, timestamp')
        .order('transaction_id');

    if (error) {
        console.error('Error fetching admissions:', error);
        return;
    }

    admissions.forEach((a, i) => {
        console.log(`[${a.transaction_id}] - ${a.full_name} (${a.timestamp})`);
        if (i > 0 && a.transaction_id === admissions[i-1].transaction_id) {
            console.log('>>> DUPLICATE FOUND ABOVE <<<');
        }
    });
}

checkDuplicates();
