package com.example.insign;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * Verifies the Spring Boot context loads successfully -
 * catches missing dependencies, bean wiring issues, etc.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT
)
class ApplicationContextTest {

    @Test
    void contextLoads() {
        // If this test passes, all beans wire up and no classes are missing
    }
}
