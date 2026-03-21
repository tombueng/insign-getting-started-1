package com.example.insign;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class InsignGettingStartedApp {

    public static void main(String[] args) {
        SpringApplication.run(InsignGettingStartedApp.class, args);
    }
}
