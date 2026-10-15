const connection = require("../config/db");
const tables = [
  ` CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,

    role ENUM('admin', 'officer')
        NOT NULL DEFAULT 'officer',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE TABLE IF NOT EXISTS locations (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    region VARCHAR(100) NOT NULL,
    zone VARCHAR(100) NOT NULL,
    city VARCHAR(100),
    woreda VARCHAR(100) NOT NULL,
    kebele VARCHAR(100) NOT NULL,
    got VARCHAR(100)
)`,
  ` CREATE TABLE IF NOT EXISTS persons (
    person_id INT AUTO_INCREMENT PRIMARY KEY,

    first_name VARCHAR(50) NOT NULL,
    middle_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,

    gender ENUM('Male','Female') NOT NULL,
    date_of_birth DATE,

    phone VARCHAR(20),
    address VARCHAR(255),

    location_id INT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (location_id)
        REFERENCES locations(location_id),

    INDEX idx_person_name
        (first_name, middle_name, last_name)
)`,
  `    CREATE TABLE IF NOT EXISTS vital_records (
        record_id INT AUTO_INCREMENT PRIMARY KEY,

        person_id INT NULL,

        location_id INT NULL,

        record_type ENUM(
            'Birth',
            'Death',
            'Marriage',
            'Divorce',
            'Adoption'
        ) NOT NULL,

        registration_date DATE NOT NULL,

        cancel_reason VARCHAR(500),

        registered_by INT NOT NULL,

        status ENUM(
            'Pending',
            'Active',
            'Cancelled'
        ) NOT NULL DEFAULT 'Pending',

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        updated_at TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP,

        FOREIGN KEY (person_id)
            REFERENCES persons(person_id),

        FOREIGN KEY (location_id)
            REFERENCES locations(location_id),

        FOREIGN KEY (registered_by)
            REFERENCES users(user_id),

        CHECK (
            record_type IN ('Marriage', 'Divorce')
            OR person_id IS NOT NULL
        )
    )`,
  `  CREATE TABLE IF NOT EXISTS births (
        birth_id INT AUTO_INCREMENT PRIMARY KEY,

        record_id INT NOT NULL UNIQUE,

        father_id INT,

        mother_id INT,

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id),

        FOREIGN KEY (father_id)
        REFERENCES persons(person_id),

        FOREIGN KEY (mother_id)
        REFERENCES persons(person_id),

        CHECK (
            father_id IS NULL
            OR
            mother_id IS NULL
            OR
            father_id <> mother_id
        )
    )`,
  `   CREATE TABLE IF NOT EXISTS deaths (
        death_id INT AUTO_INCREMENT PRIMARY KEY,

        record_id INT NOT NULL UNIQUE,

        death_date DATE NOT NULL,

        cause_of_death VARCHAR(255),

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id)
    )`,
  `  CREATE TABLE IF NOT EXISTS marriages (
        marriage_id INT AUTO_INCREMENT PRIMARY KEY,

        record_id INT NOT NULL UNIQUE,

        person1_id INT NOT NULL,

        person2_id INT NOT NULL,

        marriage_date DATE NOT NULL,

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id),

        FOREIGN KEY (person1_id)
        REFERENCES persons(person_id),

        FOREIGN KEY (person2_id)
        REFERENCES persons(person_id),

        CHECK (person1_id <> person2_id)
    )`,
  `  CREATE TABLE IF NOT EXISTS divorces (
        divorce_id INT AUTO_INCREMENT PRIMARY KEY,
        record_id INT NOT NULL UNIQUE,
        marriage_id INT NOT NULL UNIQUE,
        divorce_date DATE NOT NULL,
        reason VARCHAR(255),
        court_reference VARCHAR(100),

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id),

        FOREIGN KEY (marriage_id)
        REFERENCES marriages(marriage_id)
    )`,
  `    CREATE TABLE IF NOT EXISTS adoptions (
        adoption_id INT AUTO_INCREMENT PRIMARY KEY,

        record_id INT NOT NULL UNIQUE,

        adoptive_father_id INT,

        adoptive_mother_id INT,

        adoption_date DATE NOT NULL,

        court_reference VARCHAR(100),

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id),

        FOREIGN KEY (adoptive_father_id)
        REFERENCES persons(person_id),

        FOREIGN KEY (adoptive_mother_id)
        REFERENCES persons(person_id),

        CHECK (
            adoptive_father_id IS NOT NULL
            OR
            adoptive_mother_id IS NOT NULL
        )
    )`,
  `    CREATE TABLE IF NOT EXISTS certificates (
        certificate_id INT AUTO_INCREMENT PRIMARY KEY,

       
        record_id INT NOT NULL,

        certificate_number VARCHAR(100) NOT NULL UNIQUE,
      

        issued_date DATE NOT NULL,
        issued_by INT NOT NULL,

        status ENUM(
            'Active',
            'Cancelled'
        ) NOT NULL DEFAULT 'Active',

        FOREIGN KEY (record_id)
        REFERENCES vital_records(record_id),

        FOREIGN KEY (issued_by)
        REFERENCES users(user_id)
    )`,
];
async function createTables() {
  const db = connection.promise();

  try {
    for (let i = 0; i < tables.length; i++) {
      await db.query(tables[i]);
      console.log(`${i + 1}/${tables.length} tables created`);
    }
    console.log("All tables created successfully");
  } catch (err) {
    console.error("Table creation failed:", err.message);
  } finally {
    connection.end();
  }
}

createTables();
