package com.example.myeongranghoe;

import com.example.myeongranghoe.service.EmailVerificationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mail.javamail.JavaMailSender;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

@SpringBootTest
class EmailVerificationServiceTest {
    @Autowired
    private EmailVerificationService emailVerificationService;

    @Test
    void sendVerificationCodeReturnsCodeAndCanBeVerified() {
        var result = emailVerificationService.sendVerificationCode("student@mju.ac.kr");

        assertThat(result.code()).isNotBlank();
        assertThat(result.code()).hasSize(6);
        assertThat(emailVerificationService.verifyCode("student@mju.ac.kr", result.code())).isTrue();
    }
}
