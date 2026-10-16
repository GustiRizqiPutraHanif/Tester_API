import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { User } from './Entity/User.entity.js';
import { RegisterDto } from './Dto/Register.Dto.js';
import { LoginDto } from './Dto/Login.Dto.js';
import { ForgotPasswordDto } from './Dto/Forget-password.Dto.js';
import { ResetPasswordDto } from './Dto/Reset-Password.Dto.js';

@Injectable()
export class AuthService {
  private users: User[] = [];

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  register(registerDto: RegisterDto) {
    const existingUser = this.users.find(
      (user) => user.email.toLowerCase() === registerDto.email.toLowerCase(),
    );

    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const newUser: User = {
      id: this.users.length + 1,
      name: registerDto.name,
      email: registerDto.email,
      password: this.hashPassword(registerDto.password),
    };

    this.users.push(newUser);

    const { password, ...userWithoutPassword } = newUser;
    return {
      message: 'Registrasi berhasil',
      user: userWithoutPassword,
    };
  }

  login(loginDto: LoginDto) {
    const user = this.users.find(
      (u) => u.email.toLowerCase() === loginDto.email.toLowerCase(),
    );

    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }

    const hashedPassword = this.hashPassword(loginDto.password);
    if (user.password !== hashedPassword) {
      throw new UnauthorizedException('Email atau password salah');
    }

    // Simulasi token (bisa dikembangkan dengan JWT)
    const token = randomBytes(32).toString('hex');

    const { password, resetPasswordToken, resetPasswordExpires, ...userWithoutPassword } = user;
    return {
      message: 'Login berhasil',
      accessToken: token,
      user: userWithoutPassword,
    };
  }

  forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = this.users.find(
      (u) => u.email.toLowerCase() === forgotPasswordDto.email.toLowerCase(),
    );

    if (!user) {
      throw new NotFoundException('Email tidak ditemukan');
    }

    const resetToken = randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // berlaku 1 jam

    return {
      message: 'Token reset password telah dibuat',
      resetToken: resetToken,
      note: 'Gunakan token ini pada endpoint /auth/reset-password untuk mengubah password',
    };
  }

  resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = this.users.find(
      (u) =>
        u.resetPasswordToken === resetPasswordDto.token &&
        u.resetPasswordExpires &&
        u.resetPasswordExpires > new Date(),
    );

    if (!user) {
      throw new BadRequestException('Token reset password tidak valid atau sudah kadaluarsa');
    }

    user.password = this.hashPassword(resetPasswordDto.newPassword);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    return {
      message: 'Password berhasil diperbarui. Silakan login kembali.',
    };
  }
}
