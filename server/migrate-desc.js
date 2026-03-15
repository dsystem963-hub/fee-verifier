const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  console.log('Adding course_description column to admissions table...');
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: 'ALTER TABLE admissions ADD COLUMN IF NOT EXISTS course_description TEXT;'
  });

  if (error) {
    // If RPC isn't enabled, we might have to tell the user to do it manually or try another way.
    // Supabase doesn't always have execute_sql enabled.
    console.error('Error adding column:', error);
    console.log('\nPlease run this SQL in your Supabase SQL Editor manually:');
    console.log('ALTER TABLE admissions ADD COLUMN IF NOT EXISTS course_description TEXT;');
  } else {
    console.log('Column added successfully!');
  }
}

run();
